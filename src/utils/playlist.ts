import { LoopMode } from '@/models/cast_info.model';
import { DP1Item } from '@/models/dp1.model';

export interface PendingIntervalOverride {
  targetIndex: number;
  durationSeconds: number;
}

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
  loopMode: LoopMode = LoopMode.playlist,
  nowMs: number = Date.now()
): number {
  if (!playlistItems.length) {
    return 0;
  }

  let index = 0;
  let elapsedTime = nowMs - startTime;

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
 * Return the remaining milliseconds until the current slot should advance.
 *
 * For repeat-all we normalize into the active cycle. For repeat-off / repeat-one,
 * once wall-clock time has already exhausted the playlist we return 0 because there
 * is no automatic wrap to schedule from this helper.
 */
export function getRemainingDurationMs(
  items: DP1Item[],
  playlistStartTimeMs: number,
  loopMode: LoopMode = LoopMode.playlist,
  nowMs: number = Date.now()
): number {
  if (!items.length) {
    return 0;
  }

  const totalMs = items.reduce(
    (acc, item) => acc + (item.duration ?? 0) * 1000,
    0
  );
  if (totalMs <= 0) {
    return 0;
  }

  let elapsedMs = nowMs - playlistStartTimeMs;

  if (loopMode === LoopMode.playlist) {
    elapsedMs = ((elapsedMs % totalMs) + totalMs) % totalMs;
  } else if (elapsedMs >= totalMs) {
    return 0;
  }

  for (const item of items) {
    const itemMs = (item.duration ?? 0) * 1000;
    if (elapsedMs < itemMs) {
      return Math.max(0, itemMs - elapsedMs);
    }
    elapsedMs -= itemMs;
  }

  return 0;
}

/**
 * Resolve the active slot and the time remaining in that slot using a single
 * wall-clock sample. This keeps index and timer cadence aligned on exact
 * boundaries where a 1ms drift would otherwise change the result.
 */
export function getPlaybackPosition(
  items: DP1Item[],
  playlistStartTimeMs: number,
  loopMode: LoopMode = LoopMode.playlist,
  nowMs: number = Date.now()
): { index: number; remainingDurationMs: number } {
  return {
    index: getIndex(items, playlistStartTimeMs, loopMode, nowMs),
    remainingDurationMs: getRemainingDurationMs(
      items,
      playlistStartTimeMs,
      loopMode,
      nowMs
    ),
  };
}

/**
 * When switching to {@link LoopMode.one} after a non-wrapping timeline already
 * exceeds the full playlist duration, {@link getPlaybackPosition} reports 0 ms
 * remaining. Repeat-one still needs a positive interval; use the slot's full
 * duration as the restart cadence.
 */
export function resolveRepeatOneRestartMs(
  items: DP1Item[],
  resolvedIndex: number,
  remainingMs: number,
  nextLoopMode: LoopMode
): number {
  if (nextLoopMode !== LoopMode.one || remainingMs > 0) {
    return remainingMs;
  }
  if (resolvedIndex < 0 || resolvedIndex >= items.length) {
    return remainingMs;
  }
  const fullMs = (items[resolvedIndex].duration ?? 0) * 1000;
  return fullMs > 0 ? fullMs : remainingMs;
}

/**
 * Decide how PlaylistClient should hand off timer cadence after a setLoop command
 * has re-anchored the playback timeline.
 *
 * @param hasQueuedPlaylistPending Pass true only when a queued swap is waiting **and**
 * an interval is still driving slot boundaries. If repeat-off exhausted and cleared the
 * timer, pass false so setLoop can still install repeat-all cadence despite a pending queue.
 */
export function planSetLoopTimerHandoff(
  currentIndex: number,
  nextIndex: number,
  remainingDurationMs: number,
  isPaused: boolean,
  hasQueuedPlaylistPending = false
): {
  shouldClearTimer: boolean;
  restartDurationSeconds: number | null;
  pendingOverride: PendingIntervalOverride | null;
  resumeDurationSeconds: number | null;
} {
  if (hasQueuedPlaylistPending) {
    return {
      shouldClearTimer: false,
      restartDurationSeconds: null,
      pendingOverride: null,
      resumeDurationSeconds: null,
    };
  }

  const durationSeconds = remainingDurationMs / 1000;

  if (isPaused) {
    return {
      shouldClearTimer: false,
      restartDurationSeconds: null,
      pendingOverride: null,
      resumeDurationSeconds: durationSeconds,
    };
  }

  if (nextIndex !== currentIndex) {
    return {
      shouldClearTimer: true,
      restartDurationSeconds: null,
      pendingOverride: {
        targetIndex: nextIndex,
        durationSeconds,
      },
      resumeDurationSeconds: durationSeconds,
    };
  }

  return {
    shouldClearTimer: true,
    restartDurationSeconds: durationSeconds,
    pendingOverride: null,
    resumeDurationSeconds: durationSeconds,
  };
}

/**
 * Consume a pending interval override only when the expected index becomes active.
 * Any other index transition discards the override so stale cadence cannot leak into
 * an unrelated command path.
 */
export function consumePendingIntervalOverride(
  pendingOverride: PendingIntervalOverride | null,
  activeIndex: number
): {
  durationSeconds: number | null;
  remainingOverride: PendingIntervalOverride | null;
} {
  if (!pendingOverride) {
    return { durationSeconds: null, remainingOverride: null };
  }

  if (pendingOverride.targetIndex === activeIndex) {
    return {
      durationSeconds: pendingOverride.durationSeconds,
      remainingOverride: null,
    };
  }

  return {
    durationSeconds: null,
    remainingOverride: null,
  };
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
