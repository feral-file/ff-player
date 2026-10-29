import { CastInfo } from '@/models';
import { Reply } from '@/models/cast_request_reply.model';
import { DP1Defaults, DP1Item } from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { contentPolicyStore, policyInForce } from '../ContentPolicyStore';
import {
  allowsContent,
  ContentContext,
  parseContentContext,
} from '../contentPolicy';
import {
  appendRecentlyPlayed,
  recentlyPlayedMetadata,
  RecentlyPlayedRecord,
  recentlyPlayedReplay,
} from '../recentPlaybackHistory';

/** Owns durable playback evidence and its session-only active occurrence. A late write may retain a record, but cannot make an obsolete showing active. */
export class RecentPlaybackService {
  // Separate from castInfo: castInfo is recovery state for one current cast,
  // while these are device-local, visual-commit playback evidence. Writes are
  // serialized so two quick automatic advances cannot append to one stale
  // IndexedDB snapshot.
  private recentlyPlayedRecords: RecentlyPlayedRecord[] | null = null;

  private recentlyPlayedIncomplete: boolean | null = null;

  private recentlyPlayedLoad: Promise<RecentlyPlayedRecord[]> | null = null;

  private recentlyPlayedPersistenceError: string | null = null;

  // This is intentionally session-only. After a player restart it is unknown
  // until the current successful commit is observed; guessing by item id
  // would suppress prior repeats from the reverse-chronological history.
  private activeRecentlyPlayedRecordId: string | null = null;

  // True only while the device cannot yet say whether a retained record is on
  // the wall: from a commit until its record is durable or found too large to
  // keep, and after a player restart until the first commit. Render failures
  // have their own suspension flag below. Every stop is a known answer (no
  // retained record is showing), so History never waits on a commit that a
  // sleeping wall or a single-work cast may not make.
  private activeOccurrencePending = true;

  // Failure suspends the occurrence without discarding its durable-write
  // generation. Only its renderer-held recovery receipt may restore it.
  private occurrenceFailed = false;

  private recentlyPlayedWrite: Promise<void> = Promise.resolve();

  private recentlyPlayedSequence = 0;

  // Bumped on every new commit and every hard stop. A queued durable write
  // publishes its record as the active occurrence only while its generation is
  // still current, so a write that lands after the wall moved on (or was
  // cleared) cannot resurrect a work that is no longer displayed.
  private playbackGeneration = 0;

  /**
   * Identity of the work whose occurrence is active OR still being written.
   *
   * Deliberately NOT derived from `castInfo.index`: during a slow handoff the
   * index already names the incoming work while the outgoing one is still
   * committed and is the work history is talking about, so an index-derived
   * check inspects the wrong item. Captured at commit time, and covering the
   * pending window too — before a durable append finishes there is no record id
   * to compare, but there is very much a work that a displacement must
   * invalidate.
   */
  private occurrenceItem: DP1Item | null = null;

  /**
   * Retire the active occurrence: no retained record is on the wall.
   * `getRecentlyPlayed` then marks no record active and reports
   * `activeOccurrenceKnown: true`, so History shows the timeline instead of
   * waiting. Called when playback stops, and when a new work begins committing,
   * which then reopens the pending window itself.
   */
  public retireActiveRecentlyPlayed(): void {
    this.playbackGeneration += 1;
    this.activeRecentlyPlayedRecordId = null;
    this.activeOccurrencePending = false;
    this.occurrenceItem = null;
    this.occurrenceFailed = false;
  }

  /**
   * Read the retained history once, at boot, so the app's first request is an
   * answer rather than "still loading" — a reply it has no way to tell apart
   * from a failure, and the exact ambiguity this command exists to remove.
   */
  public async primeRecentlyPlayed(): Promise<void> {
    await this.loadRecentlyPlayed();
  }

  public async loadRecentlyPlayed(): Promise<RecentlyPlayedRecord[]> {
    if (this.recentlyPlayedRecords !== null) {
      return this.recentlyPlayedRecords;
    }
    if (this.recentlyPlayedLoad) {
      return this.recentlyPlayedLoad;
    }
    const load = Promise.all([
      DeviceManager.getRecentlyPlayed(),
      DeviceManager.getRecentlyPlayedIncomplete(),
    ])
      .then(([records, incomplete]) => {
        this.recentlyPlayedRecords = records;
        this.recentlyPlayedIncomplete = incomplete;
        return records;
      })
      .catch((error: unknown) => {
        // An unreadable or corrupt store is a GAP, not a reason to refuse
        // History for the life of the page: answering "still loading" forever is
        // indistinguishable from a broken command, and the records are gone
        // either way. Start from empty and say so — `incomplete` is what keeps
        // that honest — so the next committed work simply overwrites the record.
        console.error(
          '[CanvasService] Recently played history is unreadable',
          error
        );
        this.recentlyPlayedRecords = [];
        this.recentlyPlayedIncomplete = true;
        return this.recentlyPlayedRecords;
      });
    this.recentlyPlayedLoad = load;
    // `.catch` rather than `.finally`: a rejected promise here would be
    // unhandled, and the load above already absorbs the failure.
    void load
      .catch(() => undefined)
      .finally(() => {
        if (this.recentlyPlayedLoad === load) {
          this.recentlyPlayedLoad = null;
        }
      });
    return load;
  }

  /**
   * Called only from a successful visual commit. The returned receipt restores
   * this occurrence after genuine in-place recovery without appending a repeat.
   * A stop or another commit invalidates the receipt, including pending writes.
   */
  public recordRecentlyPlayed(
    item: DP1Item,
    defaults: DP1Defaults | null = null,
    contentContext: ContentContext = 'curated'
  ): () => void {
    // A new work is committing, so the previous occurrence is no longer the
    // active one. Retire it here, synchronously, rather than after the durable
    // write: between the two, the honest answer is "not known yet", never the
    // work that has already left the wall. This also covers the oversize path
    // below, which records nothing and must not leave a stale active record
    // standing behind the work now displayed.
    this.retireActiveRecentlyPlayed();
    this.activeOccurrencePending = true;
    // Claim the identity for the pending window as well as the active one: a
    // displacement before this write lands must still invalidate it.
    this.occurrenceItem = item;
    const generation = this.playbackGeneration;
    // Stamped HERE, at the visual commit, not inside the queued write. The
    // append runs after any earlier write and after the history read, either of
    // which can take a long time on a device — reading the clock there would
    // date a work minutes after the viewer saw it, and the ordering sequence
    // would be wrong by the same amount.
    const nowMs = Date.now();
    const nextSequence = nowMs * 1000 + ++this.recentlyPlayedSequence;
    this.recentlyPlayedWrite = this.recentlyPlayedWrite
      .then(async () => {
        const next = appendRecentlyPlayed(
          await this.loadRecentlyPlayed(),
          item,
          { nowMs, nextSequence, defaults, contentContext }
        );
        if (next === null) {
          console.warn(
            '[CanvasService] Recently played record exceeds byte budget'
          );
          await DeviceManager.setRecentlyPlayedIncomplete(true);
          this.recentlyPlayedIncomplete = true;
          // The wall shows a work History does not hold, which is a known
          // answer. Leaving it pending would hold History at a spinner for as
          // long as the work plays, typically a large on-chain `data:` work.
          if (generation === this.playbackGeneration) {
            this.activeOccurrencePending = false;
          }
          return;
        }
        await DeviceManager.setRecentlyPlayed(next);
        // Do not expose an entry before the durable transaction completes.
        this.recentlyPlayedRecords = next;
        if (this.recentlyPlayedPersistenceError) {
          // A later write succeeded, so the store is usable again and History
          // should stop answering with an error for the rest of the page's
          // life. The gap the earlier failure left is permanent, though, so
          // make it durable FIRST — clearing the error while the timeline
          // still silently claims to be complete is the one order that lies.
          await DeviceManager.setRecentlyPlayedIncomplete(true);
          this.recentlyPlayedIncomplete = true;
          this.recentlyPlayedPersistenceError = null;
        }
        // The record is retained either way; it only becomes the ACTIVE
        // occurrence if the wall still shows it. A stop or a newer commit
        // during the write moved the generation on.
        if (generation === this.playbackGeneration) {
          this.activeRecentlyPlayedRecordId = next[0]?.recordId ?? null;
          this.activeOccurrencePending = false;
        }
      })
      .catch(async (error: unknown) => {
        // Do not make a persistence failure break wall playback. Retain the
        // last known durable snapshot but make the dropped commit explicit;
        // reloading old records as complete would hide a timeline gap.
        this.recentlyPlayedIncomplete = true;
        this.recentlyPlayedPersistenceError =
          'Recently played could not persist a committed work';
        console.error(
          '[CanvasService] Failed to persist recently played history',
          error
        );
        // Try to carry the gap across a restart too. Without this the next boot
        // reloads the older records together with the previous `incomplete`
        // value and reports a timeline that is missing a committed work as
        // complete. The marker is a much smaller write than the record that
        // just failed, so it can still succeed; if it does not, the in-memory
        // flag above is all this page can honestly offer.
        try {
          await DeviceManager.setRecentlyPlayedIncomplete(true);
        } catch (markerError: unknown) {
          console.error(
            '[CanvasService] Failed to persist the history gap marker',
            markerError
          );
        }
      });
    return () => {
      if (generation === this.playbackGeneration && this.occurrenceItem) {
        this.occurrenceFailed = false;
      }
    };
  }

  public getRecentlyPlayed(): Reply & {
    status?: string;
    records?: unknown[];
    incomplete?: boolean;
    activeOccurrenceKnown?: boolean;
  } {
    if (
      this.recentlyPlayedRecords === null ||
      this.recentlyPlayedIncomplete === null
    ) {
      void this.loadRecentlyPlayed().catch((error: unknown) => {
        console.error(
          '[CanvasService] Failed to load recently played history',
          error
        );
      });
      return {
        ok: false,
        status: 'error',
        error: 'Recently played is still loading',
      };
    }
    if (this.recentlyPlayedPersistenceError) {
      return {
        ok: false,
        status: 'error',
        error: this.recentlyPlayedPersistenceError,
        incomplete: true,
      };
    }
    let records;
    try {
      records = recentlyPlayedMetadata(
        this.recentlyPlayedRecords,
        this.occurrenceFailed ? null : this.activeRecentlyPlayedRecordId
      );
    } catch (error: unknown) {
      // The projection reads labels from documents the device did not author.
      // If one of them still defeats it, answer with the contract's explicit
      // error envelope: processMessage's catch would reduce a thrown error to
      // a bare {ok:false}, which is exactly the unexplained failure the app
      // already shows today and this command exists to replace.
      console.error(
        '[CanvasService] Failed to project recently played history',
        error
      );
      return {
        ok: false,
        status: 'error',
        error: 'Recently played could not be read',
        incomplete: this.recentlyPlayedIncomplete,
      };
    }
    return {
      ok: true,
      status: records.length === 0 ? 'empty' : 'ok',
      records,
      incomplete: this.recentlyPlayedIncomplete,
      activeOccurrenceKnown:
        !this.activeOccurrencePending && !this.occurrenceFailed,
    };
  }

  public resolveRecentlyPlayed(request: unknown): Reply & {
    item?: DP1Item;
    defaults?: DP1Defaults;
    contentContext?: ContentContext;
    status?: string;
  } {
    const recordId =
      typeof request === 'object' &&
      request !== null &&
      typeof (request as { recordId?: unknown }).recordId === 'string'
        ? (request as { recordId: string }).recordId
        : '';
    if (!recordId) {
      return { ok: false, status: 'error', error: 'recordId is required' };
    }
    if (
      this.recentlyPlayedRecords === null ||
      this.recentlyPlayedIncomplete === null
    ) {
      void this.loadRecentlyPlayed().catch((error: unknown) => {
        console.error(
          '[CanvasService] Failed to load recently played history',
          error
        );
      });
      return {
        ok: false,
        status: 'error',
        error: 'Recently played is still loading',
      };
    }
    if (this.recentlyPlayedPersistenceError) {
      return {
        ok: false,
        status: 'error',
        error: this.recentlyPlayedPersistenceError,
      };
    }
    const replay = recentlyPlayedReplay(this.recentlyPlayedRecords, recordId);
    return replay
      ? { ok: true, status: 'ok', ...replay }
      : {
          ok: false,
          status: 'empty',
          error: 'Recently played record is unavailable',
        };
  }

  /**
   * Retire the active occurrence when an incoming cast drops the work that is
   * currently on the wall. Null casts are handled by the clear path; a cast
   * that still contains the outgoing item keeps its occurrence, because that
   * work is genuinely still showing until the incoming one commits.
   */
  public retireActiveOccurrenceIfDisplaced(
    // The cast AS RECEIVED. Admission filtering strips a newly blocked work
    // before this runs, taking its fresh labels with it, so asking the filtered
    // projection whether the work on screen is blocked always answers no.
    incoming: CastInfo | null,
    applied: CastInfo | null
  ): void {
    if (incoming === null) {
      return;
    }
    // A cast with nothing to show is a stop whatever came before it. Checked
    // before the occurrence guard: after a failed render or a restart there is
    // no tracked occurrence, and no commit will follow to end the pending
    // answer, which would hold History at its loading view.
    if ((applied?.playlist?.items?.length ?? 0) === 0) {
      this.retireActiveRecentlyPlayed();
      return;
    }
    const onScreen = this.occurrenceItem;
    if (onScreen === null) {
      return;
    }
    const items = incoming.playlist?.items ?? [];
    // Ask the same question the rendering gate asks, so history and the wall
    // cannot disagree: is the work on screen still something this cast shows?
    // Mere absence from the incoming cast is NOT the test — the gate keeps
    // showing an allowed outgoing work while its replacement loads, and
    // retiring here would report nothing active while it is plainly on screen.
    // What retires it is the cast going empty, or its own (or freshly
    // refreshed) labels being blocked, which is the case where the gate
    // unmounts it immediately. Its replacement's commit retires it otherwise.
    const policy = policyInForce(contentPolicyStore.getSnapshot());
    const fresh = items.find(
      item => item.id === onScreen.id && item.source === onScreen.source
    );
    const context = parseContentContext(incoming.contentContext);
    if (policy !== null && !allowsContent(fresh ?? onScreen, policy, context)) {
      this.retireActiveRecentlyPlayed();
    }
  }
  get currentItem() {
    return this.occurrenceItem;
  }
  markRenderFailed(): void {
    this.occurrenceFailed = true;
  }
}
