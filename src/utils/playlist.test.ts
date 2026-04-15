import type { DP1Item } from '@/models/dp1.model';
import { LoopMode } from '@/models/cast_info.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizePlaylistIndex,
  resolveItemIndexInNewItems,
  resolveQueuedPlaylistNextIndex,
  resolveSequentialPlaylistAdvance,
  shouldApplyQueuedPlaylistOnShuffleOrRefresh,
  shouldResumeSlotTimerAfterSetLoop,
} from './playlist';

const item = (id: string): DP1Item =>
  ({ id, source: '', license: {} }) as DP1Item;

describe('playlist index helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes indexes across playlist length', () => {
    expect(normalizePlaylistIndex(5, 3)).toBe(2);
    expect(normalizePlaylistIndex(-1, 3)).toBe(2);
    expect(normalizePlaylistIndex(0, 0)).toBe(-1);
  });

  it('resolves prior index into new playlist by stable id', () => {
    const prev = ['A', 'B', 'C', 'D', 'E'].map(id => item(id));
    const next = ['C', 'B', 'D', 'E', 'A'].map(id => item(id));
    expect(resolveItemIndexInNewItems(next, prev, 2)).toBe(0);
  });

  it('falls back when previous list is missing', () => {
    const next = ['A', 'B'].map(id => item(id));
    expect(resolveItemIndexInNewItems(next, undefined, 5)).toBe(1);
  });

  it('keeps remote target intent across deferred refresh via item id', () => {
    const prev = ['A', 'B', 'C'].map(id => item(id));
    const queued = ['C', 'A', 'D'].map(id => item(id));

    expect(
      resolveQueuedPlaylistNextIndex({
        targetIndex: 2,
        queuedPlaylist: queued,
        previousItems: prev,
        hasDeferredRefresh: true,
      })
    ).toBe(0);
  });

  it('keeps the same current item in loop-one when queued playlist is applied', () => {
    const queued = ['B', 'C', 'A'].map(id => item(id));

    expect(
      resolveQueuedPlaylistNextIndex({
        queuedPlaylist: queued,
        currentItemId: 'C',
        keepCurrent: true,
      })
    ).toBe(1);
  });

  it('advances to the next queued item when loop-one is not active', () => {
    const queued = ['B', 'C', 'A'].map(id => item(id));

    expect(
      resolveQueuedPlaylistNextIndex({
        queuedPlaylist: queued,
        currentItemId: 'C',
      })
    ).toBe(2);
  });

  it('restarts from zero when deferred refresh removed the current item', () => {
    const queued = ['B', 'C', 'A'].map(id => item(id));

    expect(
      resolveQueuedPlaylistNextIndex({
        queuedPlaylist: queued,
        currentItemId: 'missing',
        keepCurrent: true,
      })
    ).toBe(0);
  });
});

describe('sequential playlist advance', () => {
  it('holds on the final artwork when loop mode is none', () => {
    expect(
      resolveSequentialPlaylistAdvance({
        currentIndex: 2,
        playlistLength: 3,
        loopMode: LoopMode.none,
      })
    ).toBeNull();
  });

  it('wraps when loop mode is playlist', () => {
    expect(
      resolveSequentialPlaylistAdvance({
        currentIndex: 2,
        playlistLength: 3,
        loopMode: LoopMode.playlist,
      })
    ).toBe(0);
  });

  it('stays on the current artwork when loop mode is one', () => {
    expect(
      resolveSequentialPlaylistAdvance({
        currentIndex: 2,
        playlistLength: 3,
        loopMode: LoopMode.one,
      })
    ).toBe(2);
  });
});

describe('queued playlist apply / setLoop resume guards', () => {
  it('applies queued shuffle when there is no local playback yet', () => {
    expect(
      shouldApplyQueuedPlaylistOnShuffleOrRefresh({
        currentIndex: -1,
        playlistLength: 3,
        hasQueuedPlaylistPending: true,
        holdAfterFinalSlot: false,
      })
    ).toBe(true);
  });

  it('does not apply queued shuffle on timer absence alone (no hold flag)', () => {
    expect(
      shouldApplyQueuedPlaylistOnShuffleOrRefresh({
        currentIndex: 2,
        playlistLength: 3,
        hasQueuedPlaylistPending: true,
        holdAfterFinalSlot: false,
      })
    ).toBe(false);
  });

  it('applies queued shuffle only when hold flag is set at the final index', () => {
    expect(
      shouldApplyQueuedPlaylistOnShuffleOrRefresh({
        currentIndex: 2,
        playlistLength: 3,
        hasQueuedPlaylistPending: true,
        holdAfterFinalSlot: true,
      })
    ).toBe(true);
  });

  it('does not apply when hold flag is set but index is not last (stale ref)', () => {
    expect(
      shouldApplyQueuedPlaylistOnShuffleOrRefresh({
        currentIndex: 0,
        playlistLength: 3,
        hasQueuedPlaylistPending: true,
        holdAfterFinalSlot: true,
      })
    ).toBe(false);
  });

  it('does not resume slot timer while staying on repeat none', () => {
    expect(
      shouldResumeSlotTimerAfterSetLoop({
        nextLoopMode: LoopMode.none,
        holdAfterFinalSlot: true,
        currentIndex: 2,
        playlistLength: 3,
      })
    ).toBe(false);
  });

  it('resumes slot timer when leaving repeat-off hold at final index', () => {
    expect(
      shouldResumeSlotTimerAfterSetLoop({
        nextLoopMode: LoopMode.playlist,
        holdAfterFinalSlot: true,
        currentIndex: 2,
        playlistLength: 3,
      })
    ).toBe(true);
  });

  it('does not resume without explicit hold flag', () => {
    expect(
      shouldResumeSlotTimerAfterSetLoop({
        nextLoopMode: LoopMode.playlist,
        holdAfterFinalSlot: false,
        currentIndex: 2,
        playlistLength: 3,
      })
    ).toBe(false);
  });
});
