import { afterEach, describe, expect, it, vi } from 'vitest';
import { coerceLoopMode, LoopMode } from '@/models/cast_info.model';
import { DP1License, type DP1Item } from '@/models/dp1.model';
import {
  calculateStartTime,
  getIndex,
  reanchorStartTimeForNoneToPlaylist,
  reanchorStartTimeForPlaylistToNone,
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

    expect(
      getIndex(playlistItems, Date.parse('2025-01-01T00:00:00.000Z'))
    ).toBe(1);
    expect(
      getIndex(playlistItems, Date.parse('2024-12-31T23:59:10.000Z'))
    ).toBe(1);
  });

  it('reanchorStartTimeForPlaylistToNone preserves playlist phase when elapsed past one cycle', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];
    const totalMs = 60_000;
    const startMs = Date.parse('2025-01-01T00:00:00.000Z');
    const nowMs = startMs + 75_000;

    vi.useFakeTimers();
    vi.setSystemTime(nowMs);

    expect(getIndex(playlistItems, startMs, LoopMode.playlist)).toBe(1);
    expect(getIndex(playlistItems, startMs, LoopMode.none)).toBe(2);

    const anchored = reanchorStartTimeForPlaylistToNone(
      startMs,
      nowMs,
      totalMs
    );
    expect(getIndex(playlistItems, anchored, LoopMode.none)).toBe(1);
    expect(getIndex(playlistItems, anchored, LoopMode.playlist)).toBe(1);

    vi.useRealTimers();
  });

  it('reanchorStartTimeForPlaylistToNone is identity when still within first cycle', () => {
    const totalMs = 60_000;
    const startMs = Date.parse('2025-01-01T00:00:00.000Z');
    const nowMs = startMs + 35_000;
    expect(reanchorStartTimeForPlaylistToNone(startMs, nowMs, totalMs)).toBe(
      startMs
    );
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

  it('calculateStartTime subtracts prior durations and elapsed item time', () => {
    const playlistItems = [
      createItem('artwork-1', 5),
      createItem('artwork-2', 8),
      createItem('artwork-3', 13),
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:34:56.789Z'));

    const expectedBaseTime = new Date(
      '2025-01-01T12:34:56.789Z'
    ).setMilliseconds(0);

    expect(calculateStartTime(playlistItems, 2, 1500)).toBe(
      expectedBaseTime - 5000 - 8000 - 1500
    );
  });
});
