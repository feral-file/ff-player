import type { DP1Defaults, DP1Item } from '@/models/dp1.model';
import { LoopMode } from '@/models/cast_info.model';
import { NO_DURATION_VALUE } from '@/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizePlaylistIndex,
  resolveItemIndexInNewItems,
  resolveQueuedPlaylistNextIndex,
  resolveSequentialPlaylistAdvance,
  resolveSlotDurationSeconds,
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

const timedItem = (id: string, duration?: number): DP1Item =>
  ({ id, source: '', license: {}, duration }) as DP1Item;

const noDefaults: DP1Defaults | null = null;

describe('device default duration resolution', () => {
  it('returns the item duration when no device override is set', () => {
    expect(
      resolveSlotDurationSeconds({
        item: timedItem('A', 300),
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: null,
      })
    ).toBe(300);
  });

  it('replaces the item duration with the device override by default', () => {
    expect(
      resolveSlotDurationSeconds({
        item: timedItem('A', 300),
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 600,
      })
    ).toBe(600);
  });

  it('applies the device override to items with no usable duration', () => {
    expect(
      resolveSlotDurationSeconds({
        item: timedItem('A'),
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 60,
      })
    ).toBe(60);
    expect(
      resolveSlotDurationSeconds({
        item: timedItem('A', NO_DURATION_VALUE),
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 60,
      })
    ).toBe(60);
  });

});

describe('device default duration gates', () => {
  it('respects the artist veto (userOverrides=false) on the item', () => {
    const vetoed = {
      ...timedItem('A', 300),
      display: { userOverrides: false },
    } as DP1Item;
    expect(
      resolveSlotDurationSeconds({
        item: vetoed,
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 600,
      })
    ).toBe(300);
  });

  it('never cuts short a natural-length (loop=false) item', () => {
    const naturalLength = {
      ...timedItem('A'),
      display: { loop: false },
    } as DP1Item;
    expect(
      resolveSlotDurationSeconds({
        item: naturalLength,
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 600,
      })
    ).toBe(NO_DURATION_VALUE);
  });

  it('honors playlist defaults.display in the gate merge', () => {
    const defaults = {
      display: { userOverrides: false },
      license: {},
      duration: 0,
    } as unknown as DP1Defaults;
    expect(
      resolveSlotDurationSeconds({
        item: timedItem('A', 300),
        playlistDefaults: defaults,
        deviceDefaultDurationSeconds: 600,
      })
    ).toBe(300);
  });

  it('lets the item display win the gate merge over playlist defaults', () => {
    const defaults = {
      display: { userOverrides: false },
      license: {},
      duration: 0,
    } as unknown as DP1Defaults;
    const optedIn = {
      ...timedItem('A', 300),
      display: { userOverrides: true },
    } as DP1Item;
    expect(
      resolveSlotDurationSeconds({
        item: optedIn,
        playlistDefaults: defaults,
        deviceDefaultDurationSeconds: 600,
      })
    ).toBe(600);
  });
});

describe('device default duration merged-display authority', () => {
  it('gates on the merged display when provided (manifest veto wins)', () => {
    expect(
      resolveSlotDurationSeconds({
        item: timedItem('A', 300),
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 600,
        mergedDisplay: { userOverrides: false },
      })
    ).toBe(300);
  });

  it('merged display is authoritative over the synchronous item fields', () => {
    const syncVetoed = {
      ...timedItem('A', 300),
      display: { userOverrides: false },
    } as DP1Item;
    expect(
      resolveSlotDurationSeconds({
        item: syncVetoed,
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 600,
        mergedDisplay: { userOverrides: true, loop: true },
      })
    ).toBe(600);
  });

  it('merged loop=false keeps natural-length playback', () => {
    expect(
      resolveSlotDurationSeconds({
        item: timedItem('A', NO_DURATION_VALUE),
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 600,
        mergedDisplay: { loop: false },
      })
    ).toBe(NO_DURATION_VALUE);
  });
});
