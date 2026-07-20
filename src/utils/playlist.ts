import { NO_DURATION_VALUE } from '@/constants';
import { LoopMode } from '@/models/cast_info.model';
import {
  defaultDP1DisplayPreference,
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
  const layers = [item.display, item.override?.display];
  return layers.some(
    display => display?.userOverrides === false || display?.loop === false
  );
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
 * - `userOverrides: false` in the merged display preference is the artist's
 * veto on viewer re-timing; the baseline stands. (DP-1 models userOverrides
 * per-field; this codebase carries it as a single boolean, default true.)
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
 * cascade (defaults.display → item.override.display → item.display) stands
 * in, and the caller re-arms the timer once the full merge resolves so a
 * manifest-only `userOverrides: false` or `loop: false` still wins.
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
    ...(item.override?.display ?? {}),
    ...(item.display ?? {}),
  };

  if (display.userOverrides === false || display.loop === false) {
    return baseline;
  }

  return deviceDefaultDurationSeconds;
}

/**
 * Stable identity for a playlist slot. DP-1 PlaylistItem.id is optional, so
 * we synthesise one from the position and source when missing. Adjacent
 * items sharing a source must produce different identities so the player
 * can recreate the slot (and remount the <video>) between them.
 */
export function itemIdentityFor(items: DP1Item[], index: number): string {
  const item = items[index] as DP1Item | undefined;
  if (!item) {
    return '';
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
