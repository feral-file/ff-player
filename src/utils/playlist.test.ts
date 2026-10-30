import type { DP1Defaults, DP1Item } from '@/models/dp1.model';
import { LoopMode } from '@/models/cast_info.model';
import { NO_DURATION_VALUE } from '@/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasDecisiveSyncVeto,
  normalizePlaylistIndex,
  resolveItemIndexInNewItems,
  resolveQueuedPlaylistNextIndex,
  resolveSequentialPlaylistAdvance,
  resolveSlotDurationSeconds,
  resolveRepeatOffHoldAfterRebuild,
  shouldApplyQueuedPlaylistOnShuffleOrRefresh,
  slotShowingUnchanged,
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
  it('respects the artist veto (userOverrides.duration=false) on the item', () => {
    const vetoed = {
      ...timedItem('A', 300),
      display: { userOverrides: { duration: false } },
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

  it('honors an inline manifest veto in the gate merge', () => {
    // The pre-manifest fallback merge is a second, hand-maintained copy of
    // mergeItemDisplayPreference's layer order (see the LOCKSTEP note on
    // resolveSlotDurationSeconds). Its only caller today never reaches it, so
    // this is what makes deleting that layer fail loudly instead of silently
    // letting the device default override an artist's veto.
    const vetoedInline = {
      ...timedItem('A', 300),
      inlineManifest: {
        refVersion: '1.1.0',
        id: 'm1',
        created: '2026-01-01T00:00:00Z',
        controls: { display: { userOverrides: { duration: false } } },
      },
    } as unknown as DP1Item;
    expect(
      resolveSlotDurationSeconds({
        item: vetoedInline,
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 600,
      })
    ).toBe(300);
  });

});

describe('device default duration gates: playlist defaults layer', () => {
  it('does not throw when playlistDefaults has no display key (PR #312 review, run-reviewer F1)', () => {
    // defaults is untyped wire JSON; a block that sets duration/license but
    // no nested display is a valid shape the fallback cascade must survive
    // without the item's own duration being lost to a swallowed throw.
    const bareDefaults = { duration: 0, license: {} } as DP1Defaults;
    expect(() =>
      resolveSlotDurationSeconds({
        item: timedItem('A', 300),
        playlistDefaults: bareDefaults,
        deviceDefaultDurationSeconds: 600,
      })
    ).not.toThrow();
  });

  it('honors playlist defaults.display in the gate merge', () => {
    const defaults = {
      display: { userOverrides: { duration: false } },
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
      display: { userOverrides: { duration: false } },
      license: {},
      duration: 0,
    } as unknown as DP1Defaults;
    const optedIn = {
      ...timedItem('A', 300),
      display: { userOverrides: { duration: true } },
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
        mergedDisplay: { userOverrides: { duration: false } },
      })
    ).toBe(300);
  });

  it('merged display is authoritative over the synchronous item fields', () => {
    const syncVetoed = {
      ...timedItem('A', 300),
      display: { userOverrides: { duration: false } },
    } as DP1Item;
    expect(
      resolveSlotDurationSeconds({
        item: syncVetoed,
        playlistDefaults: noDefaults,
        deviceDefaultDurationSeconds: 600,
        mergedDisplay: { userOverrides: { duration: true }, loop: true },
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

describe('hasDecisiveSyncVeto', () => {
  it('is not decisive when neither layer sets any field at all', () => {
    // Regression guard: userOverrides is a map (DP-1 §4), and a playlist
    // that never mentions the `duration` key means the spec default
    // (true, i.e. not vetoed) — an absent key must never read as a veto.
    expect(hasDecisiveSyncVeto(timedItem('A', 300))).toBe(false);
  });

  it('is decisive when item.display vetoes duration', () => {
    const vetoed = {
      ...timedItem('A', 300),
      display: { userOverrides: { duration: false } },
    } as DP1Item;
    expect(hasDecisiveSyncVeto(vetoed)).toBe(true);
  });

  it('is decisive when item.display declares loop=false', () => {
    const naturalLength = {
      ...timedItem('A', 300),
      display: { loop: false },
    } as DP1Item;
    expect(hasDecisiveSyncVeto(naturalLength)).toBe(true);
  });

  it('lets item.display re-open a field that item.override.display vetoed', () => {
    const reopened = {
      ...timedItem('A', 300),
      override: { display: { userOverrides: { duration: false } } },
      display: { userOverrides: { duration: true } },
    } as DP1Item;
    expect(hasDecisiveSyncVeto(reopened)).toBe(false);
  });

  it('does not let an override-layer veto on another field read as decisive', () => {
    const scalingVetoed = {
      ...timedItem('A', 300),
      display: { userOverrides: { scaling: false } },
    } as DP1Item;
    expect(hasDecisiveSyncVeto(scalingVetoed)).toBe(false);
  });
});

describe('slotShowingUnchanged', () => {
  const slot = (id: string, source: string): DP1Item =>
    ({ id, source, license: {} }) as DP1Item;

  it('matches the same id and source across different positions', () => {
    const before = [slot('x', 's/x')];
    const after = [slot('a', 's/a'), slot('x', 's/x')];
    expect(slotShowingUnchanged(before, 0, after, 1)).toBe(true);
  });

  it('reports a same-id source swap as a different showing', () => {
    const before = [slot('a', 's/old')];
    const after = [slot('a', 's/new')];
    expect(slotShowingUnchanged(before, 0, after, 0)).toBe(false);
  });

  it('reports a different item at the same position as a different showing', () => {
    const before = [slot('a', 's/a'), slot('b', 's/b')];
    const after = [slot('a', 's/a'), slot('c', 's/c')];
    expect(slotShowingUnchanged(before, 1, after, 1)).toBe(false);
  });

  it('treats an id-less item that moved as a different showing, as the player does', () => {
    const idless = { source: 's/x', license: {} } as DP1Item;
    const before = [idless];
    // Same position: the synthesised identity matches, nothing remounts.
    expect(slotShowingUnchanged(before, 0, [idless], 0)).toBe(true);
    // Moved: its identity IS its position, so the player recreates the slot.
    const after = [slot('a', 's/a'), idless];
    expect(slotShowingUnchanged(before, 0, after, 1)).toBe(false);
  });

  it('reports a missing slot on either side rather than matching two absences', () => {
    expect(slotShowingUnchanged([], 0, [], 0)).toBe(false);
    expect(slotShowingUnchanged([slot('a', 's/a')], 0, [], 0)).toBe(false);
  });

  it('tracks which occurrence of a repeated artwork the slot is', () => {
    // The same artwork cast twice: identity and source match both slots, so
    // only the occurrence tells them apart — and it has to survive a rebuild
    // that moves the later copy, or the showing key moves with it and an
    // ended tail is replayed (feralfile-bot F7 on #320, second pass).
    const before = [slot('dup', 's/d'), slot('mid', 's/m'), slot('dup', 's/d')];
    const after = [
      slot('dup', 's/d'),
      slot('expanded', 's/e'),
      slot('mid', 's/m'),
      slot('dup', 's/d'),
    ];
    expect(slotShowingUnchanged(before, 2, after, 3)).toBe(true);
    expect(slotShowingUnchanged(before, 2, after, 0)).toBe(false);
    expect(slotShowingUnchanged(before, 0, after, 3)).toBe(false);
  });

  it('leaves a repeated id under different sources on its own occurrence', () => {
    // `[identity, source]` already separates these, so neither slot is a
    // second occurrence of anything and both keep matching across a move.
    const before = [slot('dup', 's/first'), slot('dup', 's/second')];
    const after = [
      slot('dup', 's/first'),
      slot('inserted', 's/i'),
      slot('dup', 's/second'),
    ];
    expect(slotShowingUnchanged(before, 1, after, 2)).toBe(true);
  });
});

describe('resolveRepeatOffHoldAfterRebuild', () => {
  const slot = (id: string, source: string): DP1Item =>
    ({ id, source, license: {} }) as DP1Item;

  const resolve = (
    previous: [DP1Item[], number],
    next: [DP1Item[], number],
    holdAfterFinalSlot = true
  ) =>
    resolveRepeatOffHoldAfterRebuild({
      holdAfterFinalSlot,
      previousPlaylist: previous[0],
      previousIndex: previous[1],
      nextPlaylist: next[0],
      nextIndex: next[1],
    });

  it('keeps a hold the rebuild did not move at all', () => {
    // narrowSeriesPlaylist always returns a fresh array; whenever the
    // resolved mode narrows nothing away it is content-identical.
    const before = [slot('a', 's/a'), slot('b', 's/b')];
    const after = [slot('a', 's/a'), slot('b', 's/b')];
    expect(resolve([before, 1], [after, 1])).toBe('keep');
  });

  it('keeps a hold when other slots changed but the ended item is still final', () => {
    // A group earlier in the list expanding: the held item moved position
    // but is still the last thing the playlist had to play.
    const before = [slot('e0', 's/e0'), slot('x', 's/x')];
    const after = [slot('e0', 's/e0'), slot('e1', 's/e1'), slot('x', 's/x')];
    expect(resolve([before, 1], [after, 2])).toBe('keep');
  });

  it('resumes when expansion adds editions after the ended item', () => {
    // First -> Full on the group carrying the held representative: the
    // playlist is unfinished again and nothing remounts the showing.
    const before = [slot('e0', 's/e0')];
    const after = [slot('e0', 's/e0'), slot('e1', 's/e1'), slot('e2', 's/e2')];
    expect(resolve([before, 0], [after, 0])).toBe('resume');
  });

  it('clears when the held item was narrowed away and the slot moved', () => {
    // Full -> First: the new showing mounts and plays on its own.
    const before = [slot('e0', 's/e0'), slot('e1', 's/e1')];
    const after = [slot('e0', 's/e0')];
    expect(resolve([before, 1], [after, 0])).toBe('clear');
  });

  it('never resumes when no hold is in effect, so a live showing is not reloaded', () => {
    const before = [slot('e0', 's/e0')];
    const after = [slot('e0', 's/e0'), slot('e1', 's/e1')];
    expect(resolve([before, 0], [after, 0], false)).toBe('clear');
  });

  it('clears on an empty rebuilt list rather than resuming nothing', () => {
    expect(resolve([[slot('a', 's/a')], 0], [[], 0])).toBe('clear');
  });
});
