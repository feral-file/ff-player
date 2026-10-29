import { LocalStorageItem } from '@/constants';
import { DP1Call, DP1Item } from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { deepEqual } from '@/utils/helper';
import { ContentContext, stripPlaylistSignature } from '../contentPolicy';
import { findInvalidArtworkSource } from './artworkSourceValidation';
interface CastKey {
  id?: string;
  items: DP1Item[];
}
/** Serializes boot-record writes and refresh supersession against the cast that owns the record. */
export class BootPlaylistStore {
  /** Serializes every boot-record mutation; see supersedeBootRecord. */
  private bootRecordWrite: Promise<void> = Promise.resolve();

  /**
   * The projection this service last wrote over the boot record, and the cast
   * it was written FOR. Successive refreshes of one cast each captured the same
   * live list, so without the projection a second refresh would compare against
   * a record the first one already replaced, decline, and leave the restart
   * restoring content the newer refresh had removed.
   *
   * The owner is what keeps that from becoming a blank cheque. Without it the
   * fallback asked only "is this the record I wrote", so ANY later cast's
   * refresh matched it — an ordinary now_display, refreshed once, would
   * overwrite or delete the boot record belonging to a different playlist
   * entirely. A refresh may replace this projection only if it comes from the
   * same cast that produced it. Cleared by a display_at_boot, which is what
   * keeps a stale refresh from overwriting a genuinely newer boot cast.
   */
  private supersededBootProjection: DP1Call | null = null;

  private supersededBootOwner: CastKey | null = null;

  /**
   * Store the boot record, keeping only items this version actually validated.
   *
   * Admission runs before source validation, so an item excluded by policy
   * never has its source checked. Persisting the whole payload would let a
   * later policy relaxation plus a restart hand the renderer a source nothing
   * ever validated. Boot recovery deliberately does not re-validate — that is
   * what keeps an older accepted playlist playable across an upgrade — so the
   * guarantee has to be established here, when the record is written.
   *
   * Dropping an item means the stored list no longer matches the signed
   * document, so its signature goes with it.
   */
  public persistBootPlaylist(
    dp1CallData: DP1Call,
    contentContext: ContentContext
  ): void {
    // Same queue as supersession, so a boot cast and a refresh racing for this
    // one record apply in the order they were issued.
    this.bootRecordWrite = this.bootRecordWrite
      .then(() => {
        // A new boot cast ends the refresh chain: a supersession still queued
        // behind this one belongs to the cast this replaces.
        this.supersededBootProjection = null;
        this.supersededBootOwner = null;
        return this.writeBootPlaylist(dp1CallData, contentContext);
      })
      .catch((error: unknown) => {
        console.error('[CanvasService] Error setting boot playlist:', error);
      });
  }

  /** Write the record, keeping only items this version validated. */
  public async writeBootPlaylist(
    dp1CallData: DP1Call,
    contentContext: ContentContext
  ): Promise<void> {
    const items = dp1CallData.items ?? [];
    const validated = items.filter(item => !findInvalidArtworkSource([item]));
    if (!validated.length) {
      return;
    }
    const record =
      validated.length === items.length
        ? dp1CallData
        : stripPlaylistSignature({ ...dp1CallData, items: validated });
    await DeviceManager.setBootPlaylist(record, contentContext);
  }

  /**
   * Carry an accepted refresh into the boot record that backs the same cast.
   *
   * `display_at_boot` persists what to restore after a reboot, and refreshes
   * only ever updated the live cast. So a work removed from the wall live —
   * dropped by the source, or excluded because the refresh narrowed the
   * context — came back by itself on the next restart, which for a
   * family-content narrowing is the one direction that must never happen.
   *
   * Only the record backing THIS cast is touched, so a refresh of some other
   * playlist cannot clobber it. `null` means the refresh cleared playback, and
   * the record is invalidated rather than rewritten.
   * Fire-and-forget on the same single-value write the boot path already uses,
   * so the playlist and its context can never be left disagreeing.
   */
  public supersedeBootRecord(
    previous: CastKey,
    next: DP1Call | null,
    contentContext: ContentContext
  ): void {
    // Queued behind every other boot-record mutation, and the match is checked
    // INSIDE the queue, immediately before the write. The read is asynchronous,
    // so a display_at_boot landing while it was in flight would otherwise be
    // overwritten by this older refresh — and the device would restore the
    // superseded playlist on its next restart.
    this.bootRecordWrite = this.bootRecordWrite
      .then(async () => {
        const boot = await DeviceManager.getBootPlaylist();
        if (!boot || !this.backsThisCast(boot, previous)) {
          return;
        }
        if (next === null) {
          this.supersededBootProjection = null;
          this.supersededBootOwner = null;
          await DeviceManager.removeItem(LocalStorageItem.bootPlaylist);
          return;
        }
        this.supersededBootProjection = next;
        this.supersededBootOwner = previous;
        await this.writeBootPlaylist(next, contentContext);
      })
      .catch((error: unknown) => {
        console.error(
          '[CanvasService] Error superseding boot playlist:',
          error
        );
      });
  }

  /**
   * Does this boot record back the cast being refreshed? Playlist id is the key
   * when the document carries one. DP-1 makes `id` optional, so an id-less
   * playlist falls back to its item list as it stood BEFORE the refresh — the
   * comparison has to be made against that, since the refresh is what changes
   * it. No key at all means no match: never guess at which record to overwrite.
   */
  public backsThisCast(boot: DP1Call, previous: CastKey): boolean {
    if (this.isBootRecordFor(boot, previous)) {
      return true;
    }
    // Or it is the projection an earlier refresh of this same cast wrote, which
    // a later refresh of that cast is entitled to replace.
    const own = this.supersededBootProjection;
    const owner = this.supersededBootOwner;
    return (
      own !== null &&
      owner !== null &&
      this.matchesKey(owner, previous) &&
      this.isBootRecordFor(boot, { id: own.id, items: own.items ?? [] })
    );
  }

  public isBootRecordFor(boot: DP1Call, previous: CastKey): boolean {
    return this.matchesKey({ id: boot.id, items: boot.items ?? [] }, previous);
  }

  /** Playlist id when either side carries one, item identity otherwise. */
  public matchesKey(candidate: CastKey, previous: CastKey): boolean {
    if (previous.id !== undefined || candidate.id !== undefined) {
      return candidate.id === previous.id;
    }
    // By item identity, not by value: the live cast carries normalized
    // durations the stored document does not.
    const ids = (items: DP1Item[]): (string | undefined)[] =>
      items.map(item => item.id);
    return (
      previous.items.length > 0 &&
      deepEqual(ids(candidate.items), ids(previous.items))
    );
  }
}
