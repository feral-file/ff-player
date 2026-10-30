import { NO_DURATION_VALUE } from '@/constants';
import { LoopMode } from '@/models/cast_info.model';
import {
  defaultDP1DisplayPreference,
  mergeUserOverrides,
  type DP1Defaults,
  type DP1DisplayPreference,
  type DP1Item,
} from '@/models/dp1.model';

/**
 * True when a playlist item has no usable duration set — the duration timer
 * is a no-op for these items, so same-slot replay paths must restart media
 * playback explicitly through the artwork-refresh hook.
 */
export function isNoDurationItem(item: DP1Item | undefined): boolean {
  if (!item) {
    return false;
  }
  const duration = item.duration ?? 0;
  return duration <= 0 || duration >= NO_DURATION_VALUE;
}

/**
 * A fully merged display preference tagged with the slot it was resolved
 * for. The tag lets slot-timer scheduling reject a stale merge left over
 * from another slot (see mergedDisplayForSlot). The normalized index is part
 * of the identity because DP-1 playlists may repeat the same id/ref with
 * per-slot display fields — id/ref alone cannot tell such slots apart.
 */
export interface SlotMergedDisplay {
  index: number;
  itemId: string | undefined;
  ref: string | undefined;
  display: DP1DisplayPreference;
}

/**
 * Returns the stored merged display preference only when it was resolved
 * for the slot at [index] holding [item]; null otherwise (including before
 * any merge has landed for that slot).
 */
export function mergedDisplayForSlot(
  stored: SlotMergedDisplay | null,
  item: DP1Item,
  index: number
): DP1DisplayPreference | null {
  if (
    stored?.index !== index ||
    stored.itemId !== item.id ||
    stored.ref !== item.ref
  ) {
    return null;
  }
  return stored.display;
}

/**
 * True when the item's own display layers already veto device re-timing.
 * Item.display and item.override.display outrank the ref-manifest layer in
 * the merge cascade, so a veto here is decisive no matter what the manifest
 * eventually says — callers need not hold the slot timer for the manifest.
 */
export function hasDecisiveSyncVeto(item: DP1Item): boolean {
  // Merge respecting layer precedence: item.display outranks
  // item.override.display, so a field the higher layer re-opts into
  // neutralizes the lower layer's veto (mirrors mergeItemDisplayPreference).
  const merged = { ...item.override?.display, ...item.display };
  const mergedUserOverrides = mergeUserOverrides(
    item.override?.display?.userOverrides,
    item.display?.userOverrides
  );
  return mergedUserOverrides.duration === false || merged.loop === false;
}

/**
 * True when a resolved display merge still describes the slot on screen: the
 * active slot index matches the slot the merge was started for and the item
 * occupying it still has the same id/ref. Guards against a slot change while
 * a ref manifest was loading.
 */
export function mergeStillDescribesActiveSlot(params: {
  activeIndex: number;
  activeItem: DP1Item | undefined;
  slotIndex: number;
  itemId: string | undefined;
  ref: string | undefined;
}): boolean {
  const { activeIndex, activeItem, slotIndex, itemId, ref } = params;
  return (
    activeIndex === slotIndex &&
    activeItem !== undefined &&
    activeItem.id === itemId &&
    activeItem.ref === ref
  );
}

/**
 * True when slot-timer scheduling should wait for the pending display merge:
 * a device default is set, the item has a ref manifest still resolving, and
 * no layer that outranks the manifest has already vetoed re-timing. Arming
 * anything earlier would either let a short baseline beat a longer owner
 * default or fire the override against unknown gates; the merge is bounded,
 * so the re-arm always follows.
 *
 * The gate is `item.ref` alone, deliberately: an `inlineManifest` is already
 * in hand, so there is nothing pending to hold for and the merge resolves in
 * the same tick. An item carrying BOTH still waits on the ref, because §3.6
 * makes the fetched document authoritative and it can therefore reopen a veto
 * the inline copy did not declare. So the "no waiting" benefit of an inline
 * manifest is real only for items that carry no ref.
 */
export function shouldHoldForPendingMerge(params: {
  item: DP1Item;
  mergedDisplay: DP1DisplayPreference | null;
  deviceDefaultDurationSeconds: number | null;
}): boolean {
  const { item, mergedDisplay, deviceDefaultDurationSeconds } = params;
  return (
    !mergedDisplay &&
    deviceDefaultDurationSeconds !== null &&
    !!item.ref &&
    !hasDecisiveSyncVeto(item)
  );
}

interface ResolveSlotDurationSecondsOptions {
  item: DP1Item;
  playlistDefaults: DP1Defaults | null;
  /** Device-level override in seconds; null means "auto" (no override). */
  deviceDefaultDurationSeconds: number | null;
  /**
   * The slot's fully merged display preference once the async cascade —
   * including the `item.ref` manifest layer — has resolved; null/absent
   * before that. When present it is authoritative for the override gates so
   * the timer agrees with what rendering applies; the synchronous merge
   * below is only the pre-manifest fallback.
   */
  mergedDisplay?: DP1DisplayPreference | null;
}

/**
 * Effective duration (seconds) for the slot's advance timer.
 *
 * Baseline is the item's own duration (already normalized by CanvasService:
 * missing durations arrive as NO_DURATION_VALUE, meaning the timer never
 * fires). On top of that, a device-level default duration — the viewer's
 * "each work displays this long" setting — replaces the baseline per DP-1
 * §4.1's device-level override rule, with two deliberate exceptions:
 *
 * - `userOverrides.duration === false` in the merged display preference is
 * the artist's veto on viewer re-timing; the baseline stands (DP-1 §4 models
 * `userOverrides` as a per-field map, default true per field).
 * - `loop: false` declares a time-based source that plays its natural length
 * and advances at end-of-stream. The override is skipped so a non-looping
 * film is never cut short by the device setting. This veto is deliberately
 * blanket: the gate cannot know an item's medium (DP-1 items carry only a
 * source URL; type is resolved at render), so an explicit `loop: false` on
 * any item reads as "do not re-time me". Per the spec loop has no effect on
 * non-time-based sources and defaults to true, so only items that explicitly
 * opt out take this path — for them the conservative read costs nothing.
 *
 * Gate fields come from `mergedDisplay` — the same merged preference
 * rendering applies, including the async `item.ref` manifest layer — when the
 * caller has it. Before that merge lands, the synchronous subset of the
 * cascade (defaults.display → item.inlineManifest.controls.display →
 * item.override.display → item.display) stands in, and the caller re-arms the
 * timer once the full merge resolves so a manifest-only
 * `userOverrides.duration === false` or `loop: false` still wins.
 *
 * LOCKSTEP: that fallback is a second, hand-maintained copy of
 * mergeItemDisplayPreference's layer order, minus two layers on purpose: the
 * async ref layer, which by definition has not arrived yet, and the device
 * machine-default layer, which deviceDefaultDisplay guarantees only ever
 * carries `scaling` — a field this gate does not read. Any other layer added
 * there must be added here, including in the `userOverrides` merge below
 * (see mergeUserOverrides — a plain object spread would let one layer's
 * `userOverrides` map silently erase another layer's field). Today the only
 * caller passes a non-null `deviceDefaultDurationSeconds`
 * exclusively when `mergedDisplay` is set, so the fallback never actually
 * runs — which is precisely why a drift here would go unnoticed until some
 * later change relaxed that guard, and then an artist's veto carried in an
 * inline manifest would be silently overridden by the device default.
 */
export function resolveSlotDurationSeconds({
  item,
  playlistDefaults,
  deviceDefaultDurationSeconds,
  mergedDisplay = null,
}: ResolveSlotDurationSecondsOptions): number {
  const baseline = item.duration ?? NO_DURATION_VALUE;

  if (deviceDefaultDurationSeconds === null) {
    return baseline;
  }

  const display: DP1DisplayPreference = mergedDisplay ?? {
    ...defaultDP1DisplayPreference,
    ...(playlistDefaults?.display ?? {}),
    ...(item.inlineManifest?.controls?.display ?? {}),
    ...(item.override?.display ?? {}),
    ...(item.display ?? {}),
    userOverrides: mergeUserOverrides(
      defaultDP1DisplayPreference.userOverrides,
      playlistDefaults?.display?.userOverrides,
      item.inlineManifest?.controls?.display?.userOverrides,
      item.override?.display?.userOverrides,
      item.display?.userOverrides
    ),
  };

  if (display.userOverrides?.duration === false || display.loop === false) {
    return baseline;
  }

  return deviceDefaultDurationSeconds;
}

/**
 * What the RAW cast slot a playable item was narrowed from says about its
 * identity — the half that must not move when the list around it does.
 *
 * Both identity functions below read a list POSITIONALLY, and the two things
 * they read positionally shift when narrowing changes the slots *ahead* of
 * the one asked about: an id-less item's identity embeds its own index, and
 * the occurrence of a repeated id-and-source pair counts the earlier slots
 * carrying that pair. A First<->Full flip does exactly that — it collapses
 * or expands a series group earlier in the list — so an artwork that never
 * left the screen was handed a new identity for having moved, and everything
 * keyed on it (the renderer's mount decision, the repeat-off hold, the
 * preserved deadline) read it as a different showing and replayed an ended
 * work.
 *
 * The raw cast order does not move across a narrowing — the override changes
 * what plays, never what was cast — so both values are computed once against
 * it and carried on the playable item by `narrowSeriesPlaylist`.
 */
export interface RawSlotIdentity {
  /** `itemIdentityFor` of this item's own position in the raw list. */
  identity: string;
  /** How many earlier RAW slots carry the same identity-and-source pair. */
  occurrence: number;
}

/**
 * Where that stamp lives on a playable item.
 *
 * A Symbol deliberately, not a field on `DP1Item`: `JSON.stringify` does not
 * see symbol keys, so an item recorded into recently-played history — where
 * `appendRecentlyPlayed` stores it verbatim, under a byte budget — persists
 * exactly the wire shape it did before this existed, and `DP1Item` goes on
 * meaning only what DP-1 says it means. What it does have to survive is the
 * `{...item, duration}` spread every install path applies, and object spread
 * copies own enumerable symbol keys.
 */
export const RAW_SLOT_IDENTITY = Symbol('rawSlotIdentity');

type RawSlotStamped = DP1Item & { [RAW_SLOT_IDENTITY]?: RawSlotIdentity };

/** The stamp a narrowing left on a playable item, when it has one. */
function rawSlotIdentityOf(
  item: DP1Item | undefined
): RawSlotIdentity | undefined {
  return (item as RawSlotStamped | undefined)?.[RAW_SLOT_IDENTITY];
}

/**
 * The stable raw-slot identity of every slot of a RAW cast list, in list
 * order and in one pass. `narrowSeriesPlaylist` indexes this by each
 * survivor's own raw position, so a playable item carries what its raw slot
 * said rather than what its new neighbours say.
 */
export function rawSlotIdentities(items: DP1Item[]): RawSlotIdentity[] {
  const seen = new Map<string, number>();
  return items.map((item, index) => {
    const identity = itemIdentityFor(items, index);
    const key = JSON.stringify([identity, item.source]);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return { identity, occurrence };
  });
}

/**
 * Stamps one playable item with the raw slot it was narrowed from. Returns
 * the item untouched when there is no stamp to apply, so a caller that
 * cannot name a raw slot never fabricates one.
 */
export function withRawSlotIdentity(
  item: DP1Item,
  rawSlot: RawSlotIdentity | undefined
): DP1Item {
  if (!rawSlot) {
    return item;
  }
  const stamped: RawSlotStamped = { ...item };
  stamped[RAW_SLOT_IDENTITY] = rawSlot;
  return stamped;
}

/**
 * Stable identity for a playlist slot. DP-1 PlaylistItem.id is optional, so
 * we synthesise one from the position and source when missing. Adjacent
 * items sharing a source must produce different identities so the player
 * can recreate the slot (and remount the <video>) between them.
 *
 * A narrowed slot answers with the identity of its own RAW slot instead,
 * which is the same answer for an id-carrying item and a *stable* one for an
 * id-less item: its synthetic key then names the position it was cast at,
 * not the position narrowing happens to have left it in.
 */
export function itemIdentityFor(items: DP1Item[], index: number): string {
  const item = items[index] as DP1Item | undefined;
  if (!item) {
    return '';
  }
  const rawSlot = rawSlotIdentityOf(item);
  if (rawSlot) {
    return rawSlot.identity;
  }
  const id = item.id;
  if (typeof id === 'string' && id.length > 0) {
    return id;
  }
  const source = typeof item.source === 'string' ? item.source : '';
  return `__by_index_${String(index)}__${source}`;
}

/**
 * Normalize a playlist index to the range of 0 to playlistLength - 1.
 * @param index - The index to normalize.
 * @param playlistLength - The length of the playlist.
 * @returns The normalized index.
 */
export function normalizePlaylistIndex(
  index: number,
  playlistLength: number
): number {
  if (playlistLength <= 0) {
    return -1;
  }

  const normalizedIndex = index % playlistLength;
  return normalizedIndex < 0
    ? normalizedIndex + playlistLength
    : normalizedIndex;
}

/**
 * After replacing playlist items (refresh / reorder), map the previously active
 * index onto the new list using item ids so getStatus stays aligned with the
 * artwork still playing before the UI applies the queued list.
 */
export function resolveItemIndexInNewItems(
  newItems: DP1Item[],
  previousItems: DP1Item[] | undefined,
  previousIndex: number | undefined
): number {
  if (newItems.length <= 0) {
    return -1;
  }
  if (!previousItems?.length) {
    return normalizePlaylistIndex(previousIndex ?? 0, newItems.length);
  }

  const curIdx = normalizePlaylistIndex(
    previousIndex ?? 0,
    previousItems.length
  );
  const id = previousItems[curIdx]?.id;
  if (!id) {
    return normalizePlaylistIndex(curIdx, newItems.length);
  }

  const found = newItems.findIndex(item => item.id === id);
  if (found >= 0) {
    return found;
  }

  return normalizePlaylistIndex(curIdx, newItems.length);
}

interface ResolveQueuedPlaylistNextIndexOptions {
  targetIndex?: number;
  queuedPlaylist: DP1Item[];
  previousItems?: DP1Item[];
  hasDeferredRefresh?: boolean;
  currentItemId?: string;
  keepCurrent?: boolean;
}

/**
 * Resolve the index to use when a queued playlist is finally applied.
 *
 * If a remote command already chose a target index, keep that intent and remap it
 * through item ids when the queued list came from a deferred refresh. Otherwise
 * derive the next position from the current item and optionally keep that item
 * selected (LoopMode.one) instead of advancing.
 */
export function resolveQueuedPlaylistNextIndex({
  targetIndex,
  queuedPlaylist,
  previousItems,
  hasDeferredRefresh = false,
  currentItemId,
  keepCurrent = false,
}: ResolveQueuedPlaylistNextIndexOptions): number {
  if (targetIndex !== undefined && hasDeferredRefresh) {
    return resolveItemIndexInNewItems(
      queuedPlaylist,
      previousItems,
      targetIndex
    );
  }

  if (targetIndex !== undefined) {
    return normalizePlaylistIndex(targetIndex, queuedPlaylist.length);
  }

  const currentPosInQueued = currentItemId
    ? queuedPlaylist.findIndex(item => item.id === currentItemId)
    : -1;

  if (currentPosInQueued >= 0) {
    return keepCurrent
      ? currentPosInQueued
      : normalizePlaylistIndex(currentPosInQueued + 1, queuedPlaylist.length);
  }

  return 0;
}

interface ResolveSequentialPlaylistAdvanceOptions {
  currentIndex: number;
  playlistLength: number;
  loopMode: LoopMode;
}

/**
 * Resolve the next index for timer-driven sequential playback.
 *
 * `none` holds on the final artwork instead of wrapping, `playlist` wraps
 * through the full list, and `one` keeps the current artwork selected.
 */
export function resolveSequentialPlaylistAdvance({
  currentIndex,
  playlistLength,
  loopMode,
}: ResolveSequentialPlaylistAdvanceOptions): number | null {
  if (playlistLength <= 0) {
    return null;
  }

  const normalizedIndex = normalizePlaylistIndex(currentIndex, playlistLength);
  if (normalizedIndex < 0) {
    return null;
  }

  if (loopMode === LoopMode.one) {
    return normalizedIndex;
  }

  if (loopMode === LoopMode.none && normalizedIndex === playlistLength - 1) {
    return null;
  }

  return normalizePlaylistIndex(normalizedIndex + 1, playlistLength);
}

/**
 * Whether a queued shuffle/refresh should promote the queued playlist on cast,
 * rather than waiting for the next slot timer (which repeat-off hold may never schedule).
 *
 * Callers set `holdAfterFinalSlot` only after repeat-off intentionally stops at
 * the final artwork slot; do not infer this from timer absence alone (timer gaps
 * and infinite-duration items also have no active timer).
 */
export function shouldApplyQueuedPlaylistOnShuffleOrRefresh(params: {
  currentIndex: number;
  playlistLength: number;
  hasQueuedPlaylistPending: boolean;
  holdAfterFinalSlot: boolean;
}): boolean {
  const {
    currentIndex,
    playlistLength,
    hasQueuedPlaylistPending,
    holdAfterFinalSlot,
  } = params;

  if (playlistLength <= 0 || currentIndex < 0) {
    return true;
  }
  if (!hasQueuedPlaylistPending || !holdAfterFinalSlot) {
    return false;
  }
  return (
    normalizePlaylistIndex(currentIndex, playlistLength) ===
    playlistLength - 1
  );
}

/**
 * Whether `setLoop` should restart the current slot timer after leaving repeat-off
 * hold on the final artwork. Requires the explicit hold flag plus last-slot index.
 */
export function shouldResumeSlotTimerAfterSetLoop(params: {
  nextLoopMode: LoopMode;
  holdAfterFinalSlot: boolean;
  currentIndex: number;
  playlistLength: number;
}): boolean {
  const { nextLoopMode, holdAfterFinalSlot, currentIndex, playlistLength } =
    params;

  if (nextLoopMode === LoopMode.none) {
    return false;
  }
  if (!holdAfterFinalSlot || playlistLength <= 0 || currentIndex < 0) {
    return false;
  }
  return (
    normalizePlaylistIndex(currentIndex, playlistLength) ===
    playlistLength - 1
  );
}

/**
 * Identity of one SHOWING at a slot — what decides whether ArtworkPlayer
 * keeps the element on screen or recreates it. Three parts: the item's
 * `itemIdentityFor`, its `source` (the route passes the first as
 * `itemIdentity` and the second through `castPreviewURL`), and which
 * occurrence of that pair this slot is, counted from the start of the list.
 *
 * The occurrence is what a raw slot index used to be, without its one
 * defect. A rebuild that expands a series group earlier in the list shifts
 * every later slot, so an identity carrying the index called the same
 * artwork a new showing for having moved — and an ended artwork held by
 * repeat-off was torn down and replayed. An occurrence does not move with
 * the list: the second copy of one artwork stays the second copy whatever
 * happens ahead of it, while two slots carrying the same id AND the same
 * source stay distinguishable, which is the only thing the index was ever
 * there for.
 *
 * Three shapes are unaffected, all landing on occurrence 0: an item with a
 * unique id, an item sharing an id under a different source (identity and
 * source already tell those apart), and an id-less item, whose own RAW
 * position `itemIdentityFor` folds into its identity so that no two id-less
 * slots ever share one.
 *
 * Counting the occurrence from the list in hand is still not enough on its
 * own: narrowing can remove the *earlier* copy of a repeated pair, which
 * takes the survivor from occurrence 1 to 0 although nothing about it
 * changed. So a narrowed slot answers from its `RawSlotIdentity` stamp —
 * identity and occurrence as its raw cast slot had them — and only an
 * un-narrowed list is counted in place.
 *
 * Encoded without delimiters that can also occur inside an id or a URL.
 */
export function showingIdentityFor(items: DP1Item[], index: number): string {
  const identity = itemIdentityFor(items, index);
  const source = items[index]?.source ?? '';
  const rawSlot = rawSlotIdentityOf(items[index]);
  if (rawSlot) {
    return JSON.stringify([identity, source, rawSlot.occurrence]);
  }
  let occurrence = 0;
  for (let before = 0; before < index; before += 1) {
    if (
      itemIdentityFor(items, before) === identity &&
      (items[before]?.source ?? '') === source
    ) {
      occurrence += 1;
    }
  }
  return JSON.stringify([identity, source, occurrence]);
}

/**
 * Whether two slots describe the same showing, by `showingIdentityFor`.
 * Compared this way rather than by object identity, which a playlist rebuild
 * never preserves — and through the same function the render-side showing key
 * uses, because the two must agree: this one decides whether a running
 * deadline and a repeat-off hold survive a rebuild, and a key that disagreed
 * would remount an artwork whose timer had just been preserved.
 *
 * Positions may differ, and that is the point: a slot carried across a
 * rebuild answers from the raw cast slot it was narrowed from, so neither an
 * id-carrying nor an id-less item becomes a new showing for having been
 * moved by what a narrowing did to the slots ahead of it. Two slots of one
 * artwork are still two showings, by the occurrence their raw slots had.
 */
export function slotShowingUnchanged(
  a: DP1Item[],
  indexA: number,
  b: DP1Item[],
  indexB: number
): boolean {
  if (!a[indexA] || !b[indexB]) {
    return false;
  }
  return showingIdentityFor(a, indexA) === showingIdentityFor(b, indexB);
}

/** What a playable-list rebuild must do with a repeat-off hold in effect. */
export type RepeatOffHoldAfterRebuild = 'keep' | 'resume' | 'clear';

/**
 * What a device-setting command that rebuilds the playable list must do with
 * the repeat-off hold — the flag recording that repeat-off deliberately
 * stopped on the final artwork, which `shouldResumeSlotTimerAfterSetLoop`
 * and `shouldApplyQueuedPlaylistOnShuffleOrRefresh` both gate on.
 *
 * `updateSeriesPlayback` is such a caller, and the only one that can change
 * WHICH items play: a First<->Full flip rebuilds the list around the slot on
 * screen. Three outcomes, because the flag describes one specific claim —
 * "the ended item on screen is the last thing this playlist had to play":
 *
 * `keep`: the ended item is still on screen and still the final slot, so the
 * claim stands. The rebuild may have changed other slots (a group earlier in
 * the list expanding or collapsing) or none at all — `narrowSeriesPlaylist`
 * returns a fresh array that is content-identical whenever the resolved mode
 * narrows nothing away. Clearing the flag here strands the ended slot for
 * good: no timer is armed for it, and both commands that could restart it
 * read exactly this flag.
 *
 * `resume`: the ended item is still on screen but no longer the final slot,
 * because expansion added editions after it. The playlist is unfinished
 * again, so the hold is wrong AND nothing will restart the source by itself
 * — the showing is unchanged, so the player neither remounts nor reloads.
 * The caller must reload it, the way `setLoop` does when it leaves
 * repeat-off.
 *
 * `clear`: the showing moved (the held item was narrowed away, or an id-less
 * item changed position). The new showing mounts and plays on its own; the
 * hold no longer describes anything.
 */
export function resolveRepeatOffHoldAfterRebuild(params: {
  holdAfterFinalSlot: boolean;
  previousPlaylist: DP1Item[];
  previousIndex: number;
  nextPlaylist: DP1Item[];
  nextIndex: number;
}): RepeatOffHoldAfterRebuild {
  const {
    holdAfterFinalSlot,
    previousPlaylist,
    previousIndex,
    nextPlaylist,
    nextIndex,
  } = params;

  // Nothing held: the flag is already false and a live showing must never be
  // reloaded by a rebuild that only re-selected the same slot.
  if (!holdAfterFinalSlot || nextPlaylist.length === 0) {
    return 'clear';
  }
  if (
    !slotShowingUnchanged(
      previousPlaylist,
      previousIndex,
      nextPlaylist,
      nextIndex
    )
  ) {
    return 'clear';
  }
  return nextIndex === nextPlaylist.length - 1 ? 'keep' : 'resume';
}
