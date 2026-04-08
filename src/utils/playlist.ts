import { LoopMode } from '@/models/cast_info.model';
import { DP1Item } from '@/models/dp1.model';

/**
 * Map wall-clock elapsed time since playlist `startTime` to the active item index.
 *
 * - {@link LoopMode.playlist}: time wraps modulo full playlist duration (repeat all).
 * - {@link LoopMode.none}: after one full pass, index stays on the last item.
 * - {@link LoopMode.one}: same non-wrapping timeline as `none` here; the playlist
 *   client handles per-slot replay and usually resets `startTime` before the clamp applies.
 */
export function getIndex(
  playlistItems: DP1Item[],
  startTime: number,
  loopMode: LoopMode = LoopMode.playlist
): number {
  if (!playlistItems.length) {
    return 0;
  }

  let index = 0;
  const currentTime = Date.now();
  let elapsedTime = currentTime - startTime;

  const totalDuration = playlistItems.reduce(
    (acc, item) => acc + (item.duration ?? 0) * 1000,
    0
  );

  if (totalDuration <= 0) {
    return 0;
  }

  if (loopMode === LoopMode.playlist) {
    elapsedTime = elapsedTime % totalDuration;
  } else {
    // Repeat off (`none`) or repeat one (`one`): no wrap. Past one full pass, clamp to
    // the last slot. Repeat-one normally resets the timeline before this matters.
    if (elapsedTime >= totalDuration) {
      return playlistItems.length - 1;
    }
  }

  for (let i = 0; i < playlistItems.length; i++) {
    const item = playlistItems[i];
    elapsedTime -= (item.duration ?? 0) * 1000;
    if (elapsedTime < 0) {
      index = i;
      break;
    }
  }

  return index;
}

/**
 * Milliseconds remaining until the end of the slot {@link getIndex} would select at
 * `nowMs`. Same phase math as `getIndex` so the playlist client can reschedule its
 * interval after `setLoop` rewrites `startTime` (avoids a stale full-slot timer when the
 * true remainder is ~0, e.g. none→playlist on a last-slot boundary).
 */
export function remainingMsInActiveSlot(
  playlistItems: DP1Item[],
  startTimeMs: number,
  loopMode: LoopMode,
  nowMs: number = Date.now()
): number {
  if (!playlistItems.length) {
    return 0;
  }

  let elapsedTime = nowMs - startTimeMs;

  const totalDuration = playlistItems.reduce(
    (acc, item) => acc + (item.duration ?? 0) * 1000,
    0
  );

  if (totalDuration <= 0) {
    return 0;
  }

  if (loopMode === LoopMode.playlist) {
    elapsedTime = elapsedTime % totalDuration;
  } else {
    if (elapsedTime >= totalDuration) {
      const lastIdx = playlistItems.length - 1;
      let beforeLastMs = 0;
      for (const item of playlistItems.slice(0, lastIdx)) {
        beforeLastMs += (item.duration ?? 0) * 1000;
      }
      const lastDurMs = (playlistItems[lastIdx].duration ?? 0) * 1000;
      const intoLastMs = elapsedTime - beforeLastMs;
      return Math.max(0, lastDurMs - intoLastMs);
    }
  }

  for (const item of playlistItems) {
    const itemMs = (item.duration ?? 0) * 1000;
    if (elapsedTime < itemMs) {
      return itemMs - elapsedTime;
    }
    elapsedTime -= itemMs;
  }

  return 0;
}

/**
 * If repeat-off has finished one full cycle, wall-clock elapsed exceeds the playlist
 * length while the UI still shows the last item. Switching to repeat-all would apply
 * modulo to that large elapsed and jump to an arbitrary index.
 *
 * Re-anchor so {@link getIndex} with {@link LoopMode.playlist} still resolves to the
 * **last** item, at the correct phase **inside that item's duration slot**: we use
 * `posInLastMs % lastDurMs` so any extra dwell past the nominal slot end is folded
 * back into the slot. Repeat-all then runs out the **remainder** of that slot before
 * modulo wraps to the first item.
 */
export function reanchorStartTimeForNoneToPlaylist(
  items: DP1Item[],
  playlistStartTimeMs: number,
  nowMs: number
): number | null {
  if (!items.length) {
    return null;
  }
  const totalMs = items.reduce(
    (acc, item) => acc + (item.duration ?? 0) * 1000,
    0
  );
  if (totalMs <= 0) {
    return null;
  }
  const elapsed = nowMs - playlistStartTimeMs;
  if (elapsed < totalMs) {
    return null;
  }

  const lastIdx = items.length - 1;
  let totalBeforeLastMs = 0;
  for (let i = 0; i < lastIdx; i++) {
    totalBeforeLastMs += (items[i].duration ?? 0) * 1000;
  }
  const lastDurMs = (items[lastIdx].duration ?? 0) * 1000;
  const startOfLastWallMs = playlistStartTimeMs + totalBeforeLastMs;
  const posInLastMs = nowMs - startOfLastWallMs;

  let posWithinLastMs = 0;
  if (lastDurMs > 0 && posInLastMs > 0) {
    const rem = posInLastMs % lastDurMs;
    // rem === 0 means wall clock sits on a slot boundary (end of last item). Treat as
    // the last instant inside the slot so repeat-all wraps next, instead of replaying
    // a full last slot from offset 0.
    posWithinLastMs =
      rem === 0 ? Math.max(0, lastDurMs - 1) : rem;
  }

  const offsetInCycleMs = totalBeforeLastMs + posWithinLastMs;
  return nowMs - offsetInCycleMs;
}

/**
 * When leaving repeat-all for repeat-off, wall-clock `now - startTime` may be ≥ one full
 * cycle while the visible item is still mid-pass (repeat-all uses modulo). Without
 * re-anchoring, {@link getIndex} with {@link LoopMode.none} clamps to the last item.
 * Set `startTime` so `now - startTime` equals the same remainder in `[0, total)` as
 * playlist modulo — index and phase match the instant before the mode change.
 */
export function reanchorStartTimeForPlaylistToNone(
  playlistStartTimeMs: number,
  nowMs: number,
  totalPlaylistDurationMs: number
): number {
  if (totalPlaylistDurationMs <= 0) {
    return playlistStartTimeMs;
  }
  const elapsed = nowMs - playlistStartTimeMs;
  let offsetInCycle = elapsed % totalPlaylistDurationMs;
  if (offsetInCycle < 0) {
    offsetInCycle += totalPlaylistDurationMs;
  }
  return nowMs - offsetInCycle;
}

export function calculateStartTime(
  dp1Items: DP1Item[],
  index: number,
  elapsedTime?: number
): number {
  let startTime = new Date().setMilliseconds(0);
  for (let i = 0; i < index; i++) {
    startTime -= (dp1Items[i].duration ?? 0) * 1000;
  }

  if (elapsedTime) {
    startTime -= elapsedTime;
  }

  return startTime;
}

export function getArtworkStartTime(
  dp1Items: DP1Item[],
  index: number,
  playlistStartTime: number
): number {
  // Start with the playlist's start time
  let artworkStartTime = playlistStartTime;

  // Add the duration of all previous artworks
  for (let i = 0; i < index; i++) {
    artworkStartTime += (dp1Items[i].duration ?? 0) * 1000;
  }

  return artworkStartTime;
}

export function recalculateStartTimeForIndex(
  dp1Items: DP1Item[],
  targetIndex: number
): number {
  if (targetIndex < 0 || targetIndex >= dp1Items.length) {
    return new Date().setMilliseconds(0);
  }

  const currentTime = Date.now();
  let totalDurationBeforeIndex = 0;
  for (let i = 0; i < targetIndex; i++) {
    totalDurationBeforeIndex += (dp1Items[i].duration ?? 0) * 1000;
  }

  const newStartTime = currentTime - totalDurationBeforeIndex;

  return newStartTime;
}
