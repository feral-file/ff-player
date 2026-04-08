import { afterEach, describe, expect, it, vi } from 'vitest';
import { coerceLoopMode, LoopMode } from '@/models/cast_info.model';
import { DP1License, type DP1Item } from '@/models/dp1.model';
import {
  calculateStartTime,
  consumePendingIntervalOverride,
  getIndex,
  getPlaybackPosition,
  getRemainingDurationMs,
  planSetLoopTimerHandoff,
  reanchorStartTimeForNoneToPlaylist,
} from './playlist';

function createItem(id: string, duration: number): DP1Item {
  return {
    id,
    source: `https://example.com/${id}.jpg`,
    duration,
    license: DP1License.Open,
  };
}

describe('playlist timing helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coerceLoopMode accepts none and defaults unknown to playlist', () => {
    expect(coerceLoopMode('none')).toBe(LoopMode.none);
    expect(coerceLoopMode('playlist')).toBe(LoopMode.playlist);
    expect(coerceLoopMode(undefined)).toBe(LoopMode.playlist);
    expect(coerceLoopMode('nope')).toBe(LoopMode.playlist);
  });

  it('getIndex wraps elapsed time across total playlist duration', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:25.000Z'));

    expect(getIndex(playlistItems, Date.parse('2025-01-01T00:00:00.000Z'))).toBe(
      1
    );
    expect(
      getIndex(playlistItems, Date.parse('2024-12-31T23:59:10.000Z'))
    ).toBe(1);
  });

  it('reanchorStartTimeForNoneToPlaylist returns null during the first pass', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];
    const startMs = Date.parse('2025-01-01T00:00:00.000Z');
    const nowMs = startMs + 35_000;
    expect(
      reanchorStartTimeForNoneToPlaylist(playlistItems, startMs, nowMs)
    ).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    expect(getIndex(playlistItems, startMs, LoopMode.playlist)).toBe(2);
    expect(getIndex(playlistItems, startMs, LoopMode.none)).toBe(2);
    vi.useRealTimers();
  });

  it('reanchorStartTimeForNoneToPlaylist keeps last item until that slot finishes', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];
    const startMs = Date.parse('2025-01-01T00:00:00.000Z');
    const nowMs = startMs + 75_000;
    const anchored = reanchorStartTimeForNoneToPlaylist(
      playlistItems,
      startMs,
      nowMs
    );
    expect(anchored).not.toBeNull();
    if (anchored === null) {
      throw new Error('expected anchored start time');
    }

    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    // Without re-anchor, modulo maps 75s elapsed into the middle of the playlist.
    expect(getIndex(playlistItems, startMs, LoopMode.playlist)).toBe(1);
    // 75s wall = 45s into last 30s slot → 15s left in slot; still last item.
    expect(getIndex(playlistItems, anchored, LoopMode.playlist)).toBe(2);

    // After the remaining 15s of the last slot, repeat-all wraps to the first item.
    vi.setSystemTime(nowMs + 15_000);
    expect(getIndex(playlistItems, anchored, LoopMode.playlist)).toBe(0);
    vi.useRealTimers();
  });

  it('getIndex with repeat off stays on the last item after one full cycle', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:01:05.000Z'));

    const start = Date.parse('2025-01-01T00:00:00.000Z');
    expect(getIndex(playlistItems, start, LoopMode.none)).toBe(2);

    vi.setSystemTime(new Date('2025-01-01T00:00:25.000Z'));
    expect(getIndex(playlistItems, start, LoopMode.none)).toBe(1);
  });

  it('getIndex with LoopMode.one clamps to last item like none (client resets startTime before this matters)', () => {
    // LoopMode.one uses the same non-wrapping branch as LoopMode.none in getIndex.
    // The playlist client normally resets startTime every slot, so the clamp only
    // applies if the client somehow misses a reset. Verifying it here guards against
    // accidental removal of the clamp.
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];

    vi.useFakeTimers();
    const start = Date.parse('2025-01-01T00:00:00.000Z');

    // Mid-playlist: normal resolution.
    vi.setSystemTime(start + 15_000);
    expect(getIndex(playlistItems, start, LoopMode.one)).toBe(1);

    // After one full pass (65s): clamps to last item, no wrap.
    vi.setSystemTime(start + 65_000);
    expect(getIndex(playlistItems, start, LoopMode.one)).toBe(2);
  });

  it('reanchorStartTimeForNoneToPlaylist on exact slot boundary keeps last item and wraps on next ms', () => {
    // Exercises the rem === 0 branch: when wall-clock lands exactly on a slot boundary
    // (posInLastMs is a multiple of lastDurMs), treat it as (lastDurMs - 1) so
    // repeat-all wraps on the NEXT tick instead of replaying a full last slot.
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];
    const startMs = Date.parse('2025-01-01T00:00:00.000Z');
    // Exactly 1 full cycle (60s) → posInLastMs = 30_000 = lastDurMs, rem === 0.
    const nowMs = startMs + 60_000;
    const anchored = reanchorStartTimeForNoneToPlaylist(
      playlistItems,
      startMs,
      nowMs
    );
    expect(anchored).not.toBeNull();
    if (anchored === null) {
      throw new Error('expected anchored start time');
    }

    vi.useFakeTimers();

    // At the exact boundary, repeat-all still shows the last item.
    vi.setSystemTime(nowMs);
    expect(getIndex(playlistItems, anchored, LoopMode.playlist)).toBe(2);

    // One ms later: modulo wraps to the first item.
    vi.setSystemTime(nowMs + 1);
    expect(getIndex(playlistItems, anchored, LoopMode.playlist)).toBe(0);
  });

  it('getRemainingDurationMs matches the remaining time after none-to-playlist re-anchor', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];
    const startMs = Date.parse('2025-01-01T00:00:00.000Z');
    const nowMs = startMs + 75_000;
    const anchored = reanchorStartTimeForNoneToPlaylist(
      playlistItems,
      startMs,
      nowMs
    );

    expect(anchored).not.toBeNull();
    if (anchored === null) {
      throw new Error('expected anchored start time');
    }

    expect(
      getRemainingDurationMs(playlistItems, anchored, LoopMode.playlist, nowMs)
    ).toBe(15_000);
  });

  it('getRemainingDurationMs returns one millisecond on the exact re-anchor boundary', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];
    const startMs = Date.parse('2025-01-01T00:00:00.000Z');
    const nowMs = startMs + 60_000;
    const anchored = reanchorStartTimeForNoneToPlaylist(
      playlistItems,
      startMs,
      nowMs
    );

    expect(anchored).not.toBeNull();
    if (anchored === null) {
      throw new Error('expected anchored start time');
    }

    expect(
      getRemainingDurationMs(playlistItems, anchored, LoopMode.playlist, nowMs)
    ).toBe(1);
  });

  it('getPlaybackPosition keeps index and remaining time aligned on the exact re-anchor boundary', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];
    const startMs = Date.parse('2025-01-01T00:00:00.000Z');
    const nowMs = startMs + 60_000;
    const anchored = reanchorStartTimeForNoneToPlaylist(
      playlistItems,
      startMs,
      nowMs
    );

    expect(anchored).not.toBeNull();
    if (anchored === null) {
      throw new Error('expected anchored start time');
    }

    expect(
      getPlaybackPosition(playlistItems, anchored, LoopMode.playlist, nowMs)
    ).toEqual({
      index: 2,
      remainingDurationMs: 1,
    });
  });

  it('planSetLoopTimerHandoff restarts immediately when the active index stays the same', () => {
    expect(planSetLoopTimerHandoff(2, 2, 1, false)).toEqual({
      shouldClearTimer: true,
      restartDurationSeconds: 0.001,
      pendingOverride: null,
      resumeDurationSeconds: 0.001,
    });
  });

  it('planSetLoopTimerHandoff queues the slot remainder when loop change moves to a new index', () => {
    expect(planSetLoopTimerHandoff(2, 0, 15_000, false)).toEqual({
      shouldClearTimer: true,
      restartDurationSeconds: null,
      pendingOverride: {
        targetIndex: 0,
        durationSeconds: 15,
      },
      resumeDurationSeconds: 15,
    });
  });

  it('planSetLoopTimerHandoff does not restart timers while paused', () => {
    expect(planSetLoopTimerHandoff(2, 0, 15_000, true)).toEqual({
      shouldClearTimer: false,
      restartDurationSeconds: null,
      pendingOverride: null,
      resumeDurationSeconds: 15,
    });
  });

  it('planSetLoopTimerHandoff defers to the current playback flow while a queued playlist is pending', () => {
    expect(planSetLoopTimerHandoff(2, 0, 15_000, false, true)).toEqual({
      shouldClearTimer: false,
      restartDurationSeconds: null,
      pendingOverride: null,
      resumeDurationSeconds: null,
    });
  });

  it('consumePendingIntervalOverride applies the queued cadence only to the intended index', () => {
    expect(
      consumePendingIntervalOverride(
        {
          targetIndex: 0,
          durationSeconds: 15,
        },
        0
      )
    ).toEqual({
      durationSeconds: 15,
      remainingOverride: null,
    });
  });

  it('consumePendingIntervalOverride discards stale queued cadence on unrelated index changes', () => {
    expect(
      consumePendingIntervalOverride(
        {
          targetIndex: 0,
          durationSeconds: 15,
        },
        1
      )
    ).toEqual({
      durationSeconds: null,
      remainingOverride: null,
    });
  });

  it('calculateStartTime subtracts prior durations and elapsed item time', () => {
    const playlistItems = [
      createItem('artwork-1', 5),
      createItem('artwork-2', 8),
      createItem('artwork-3', 13),
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:34:56.789Z'));

    const expectedBaseTime = new Date('2025-01-01T12:34:56.789Z').setMilliseconds(
      0
    );

    expect(calculateStartTime(playlistItems, 2, 1500)).toBe(
      expectedBaseTime - 5000 - 8000 - 1500
    );
  });
});
