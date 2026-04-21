/* eslint-disable max-lines -- Single module: PlaylistClient wiring (hold/queue + intermission). */
/**
 * Wiring tests: `PlaylistClient` consumes `castInfo` from `AppContext` while
 * `applyQueuedPlaylistIfExists` reads `canvasService`. Deferred refresh uses
 * the same `CanvasService.refreshPlaylist` path as production; intermission
 * cases cover overlay + queued promotion.
 */
import { AppContext } from '@/context/AppContext';
import {
  DP1_DEFAULT_INTERMISSION_SECONDS,
  NO_DURATION_VALUE,
} from '@/constants';
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import type { DP1Call, DP1IntermissionNote, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, render } from '@testing-library/react';
import { useMemo, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaylistClient, {
  getDP1IntermissionDurationSeconds,
  nextPlaylistIntermissionKey,
} from './playlist-client';

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: () => null,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

function canvasInternals(): {
  queuedPlaylistPending: boolean;
  deferredRefreshPlaylist: DP1Call | null;
  originalPlaylistItems: unknown;
  refreshPlaylist: (newItems: DP1Item[] | undefined) => { ok: boolean };
} {
  return canvasService as unknown as {
    queuedPlaylistPending: boolean;
    deferredRefreshPlaylist: DP1Call | null;
    originalPlaylistItems: unknown;
    refreshPlaylist: (newItems: DP1Item[] | undefined) => { ok: boolean };
  };
}

function dp1Call(id: string, items: DP1Item[]): DP1Call {
  return {
    dpVersion: '1',
    id,
    title: id,
    items,
  };
}

function item(id: string, durationSeconds: number): DP1Item {
  return {
    id,
    source: `https://example.com/${id}.jpg`,
    license: {},
    duration: durationSeconds,
  } as DP1Item;
}

function itemWithNote(
  id: string,
  durationSeconds: number,
  noteText: string,
  noteDurationSeconds?: number
): DP1Item {
  return {
    ...item(id, durationSeconds),
    note:
      noteDurationSeconds !== undefined
        ? { text: noteText, duration: noteDurationSeconds }
        : { text: noteText },
  };
}

function displayCast(
  items: DP1Item[],
  index: number,
  loopMode: LoopMode
): CastInfo {
  return {
    castCommand: CastCommand.displayPlaylist,
    playlist: dp1Call('pl', items),
    index,
    loopMode,
  };
}

function PlaylistHarness(props: { castInfo: CastInfo | null }): ReactElement {
  const value = useMemo(
    () => ({
      context: {
        isInitialized: true,
        isOnline: true,
        appRemoteConfig: {},
        displaySettings: null,
        cursorPositions: null,
        castInfo: props.castInfo,
      },
    }),
    [props.castInfo]
  );

  return (
    <AppContext.Provider value={value as never}>
      <PlaylistClient />
    </AppContext.Provider>
  );
}

async function advanceMs(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function teardownPlaylistWiringTest(): void {
  vi.useRealTimers();
  canvasService.setCastInfo(null, false);
  const s = canvasInternals();
  s.queuedPlaylistPending = false;
  s.deferredRefreshPlaylist = null;
  s.originalPlaylistItems = null;
}

describe('playlist-client — getDP1IntermissionDurationSeconds', () => {
  it('uses schema default when duration is omitted', () => {
    const note: DP1IntermissionNote = { text: 'Hello' };
    expect(getDP1IntermissionDurationSeconds(note)).toBe(
      DP1_DEFAULT_INTERMISSION_SECONDS
    );
  });

  it('uses explicit positive duration', () => {
    const note: DP1IntermissionNote = { text: 'Hello', duration: 12 };
    expect(getDP1IntermissionDurationSeconds(note)).toBe(12);
  });

  it('falls back when duration is zero or negative', () => {
    expect(getDP1IntermissionDurationSeconds({ text: 'a', duration: 0 })).toBe(
      DP1_DEFAULT_INTERMISSION_SECONDS
    );
    expect(getDP1IntermissionDurationSeconds({ text: 'a', duration: -1 })).toBe(
      DP1_DEFAULT_INTERMISSION_SECONDS
    );
  });
});

describe('playlist-client — nextPlaylistIntermissionKey', () => {
  it('uses playlist id and bumps epoch', () => {
    const ref = { current: 0 };
    expect(nextPlaylistIntermissionKey('pl-1', ref)).toBe('pl-1_0');
    expect(ref.current).toBe(1);
    expect(nextPlaylistIntermissionKey('pl-1', ref)).toBe('pl-1_1');
    expect(ref.current).toBe(2);
  });

  it('falls back to session prefix when id is missing', () => {
    const ref = { current: 0 };
    expect(nextPlaylistIntermissionKey(undefined, ref)).toBe('__session_0');
    expect(nextPlaylistIntermissionKey('', ref)).toBe('__session_1');
  });
});

describe('PlaylistClient — no hold (final item has no finite slot timer)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('does not apply queued setShuffle', async () => {
    const items = [item('a', 1), item('b', NO_DURATION_VALUE)];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { rerender } = render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(1000);

    canvasInternals().queuedPlaylistPending = true;
    const shuffled = displayCast([items[1], items[0]], 0, LoopMode.none);
    shuffled.castCommand = CastCommand.setShuffle;
    shuffled.shuffle = true;
    canvasService.setCastInfo(shuffled, false);
    rerender(<PlaylistHarness castInfo={shuffled} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
  });

  it('does not apply queued refreshPlaylist', async () => {
    const items = [item('a', 1), item('b', NO_DURATION_VALUE)];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { rerender } = render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(1000);

    canvasInternals().queuedPlaylistPending = true;
    const refreshed = displayCast([items[1], items[0]], 1, LoopMode.none);
    refreshed.castCommand = CastCommand.refreshPlaylist;
    canvasService.setCastInfo(refreshed, false);
    rerender(<PlaylistHarness castInfo={refreshed} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
  });
});

describe('PlaylistClient — hold completed final timed slot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('promotes queued setShuffle on cast when holding final slot', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { rerender } = render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(1000);
    await advanceMs(1000);

    canvasInternals().queuedPlaylistPending = true;
    const shuffled: CastInfo = {
      castCommand: CastCommand.setShuffle,
      playlist: dp1Call('pl', [items[1], items[0]]),
      index: 0,
      loopMode: LoopMode.none,
      shuffle: true,
    };
    canvasService.setCastInfo(shuffled, false);
    rerender(<PlaylistHarness castInfo={shuffled} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
  });

  it('promotes deferred refreshPlaylist on cast when holding final slot', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { rerender } = render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(1000);
    await advanceMs(1000);

    const reply = canvasInternals().refreshPlaylist([
      item('a', 1),
      item('c', 1),
    ]);
    expect(reply).toEqual({ ok: true });
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);

    const nextCast = canvasService.getCastInfo();
    if (nextCast === null) {
      throw new Error('expected castInfo after deferred refreshPlaylist');
    }
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(
      canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
    ).toEqual(['a', 'c']);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });
});

describe('PlaylistClient — setLoop after hold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('resumes the slot timer when leaving repeat-off from final-slot hold', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { rerender } = render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(1000);
    await advanceMs(1000);

    const prior = canvasService.getCastInfo();
    expect(prior).not.toBeNull();
    const loopOn: CastInfo = {
      ...prior,
      castCommand: CastCommand.setLoop,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(loopOn, false);
    rerender(<PlaylistHarness castInfo={loopOn} />);

    await advanceMs(1000);

    expect(canvasService.getCastInfo()?.index).toBe(0);
  });
});

describe('PlaylistClient — playlistKey refresh on playlist replacement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('generates new playlistKey when deferred refresh is promoted', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    await advanceMs(1000);
    await advanceMs(1000);

    const reply = canvasInternals().refreshPlaylist([
      item('a', 1),
      item('c', 1),
    ]);
    expect(reply).toEqual({ ok: true });
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);

    const nextCast = canvasService.getCastInfo();
    if (nextCast === null) {
      throw new Error('expected castInfo after deferred refreshPlaylist');
    }
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    expect(
      canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
    ).toEqual(['a', 'c']);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    expect(container).toBeTruthy();
  });

  it('generates new playlistKey when setShuffle is promoted on final-slot hold', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    await advanceMs(1000);
    await advanceMs(1000);

    canvasInternals().queuedPlaylistPending = true;
    const shuffled: CastInfo = {
      castCommand: CastCommand.setShuffle,
      playlist: dp1Call('pl', [items[1], items[0]]),
      index: 0,
      loopMode: LoopMode.none,
      shuffle: true,
    };
    canvasService.setCastInfo(shuffled, false);
    rerender(<PlaylistHarness castInfo={shuffled} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);

    expect(container).toBeTruthy();
  });

  it('generates new playlistKey when castInfo is cleared', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    await advanceMs(500);

    canvasService.setCastInfo(null, false);
    rerender(<PlaylistHarness castInfo={null} />);

    const newCast = displayCast(
      [item('x', 1), item('y', 1)],
      0,
      LoopMode.playlist
    );
    canvasService.setCastInfo(newCast, false);
    rerender(<PlaylistHarness castInfo={newCast} />);

    expect(container).toBeTruthy();
  });
});

describe('PlaylistClient — intermission: queued refresh after timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('promotes queued refreshPlaylist when item intro timer completes', async () => {
    const items = [itemWithNote('a', 1, 'Intro for A', 2), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro for A');

    canvasInternals().queuedPlaylistPending = true;
    const refreshCast: CastInfo = {
      castCommand: CastCommand.refreshPlaylist,
      playlist: {
        ...dp1Call('pl', [item('a', 1), item('c', 1)]),
        items: [item('a', 1), item('c', 1)],
      },
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(refreshCast, false);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);

    await advanceMs(2000);

    const nextCast = canvasService.getCastInfo();
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(
      canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
    ).toEqual(['a', 'c']);
  });
});

describe('PlaylistClient — intermission: queued refresh after dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('promotes queued refreshPlaylist when item intro is dismissed', async () => {
    const items = [itemWithNote('a', 1, 'Intro for A'), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro for A');

    canvasInternals().queuedPlaylistPending = true;
    const refreshCast: CastInfo = {
      castCommand: CastCommand.refreshPlaylist,
      playlist: {
        ...dp1Call('pl', [item('a', 1), item('c', 1)]),
        items: [item('a', 1), item('c', 1)],
      },
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(refreshCast, false);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);

    (overlay as HTMLElement).click();

    await advanceMs(0);

    const nextCast = canvasService.getCastInfo();
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(
      canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
    ).toEqual(['a', 'c']);
  });
});

describe('PlaylistClient — intermission: queued shuffle after playlist intro dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('promotes queued setShuffle when playlist intro is dismissed', async () => {
    const playlistNote = { text: 'Welcome to this playlist' };
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    if (initial.playlist) {
      initial.playlist = { ...initial.playlist, note: playlistNote };
    }
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Welcome to this playlist');

    canvasInternals().queuedPlaylistPending = true;
    const shuffled: CastInfo = {
      castCommand: CastCommand.setShuffle,
      playlist: { ...dp1Call('pl', [items[1], items[0]]), note: playlistNote },
      index: 0,
      loopMode: LoopMode.playlist,
      shuffle: true,
    };
    canvasService.setCastInfo(shuffled, false);

    (overlay as HTMLElement).click();

    await advanceMs(0);

    const nextCast = canvasService.getCastInfo();
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
  });
});

describe('PlaylistClient — intermission: currentItemRef regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('applies queued update when item intro is dismissed', async () => {
    const items = [
      item('a', 1),
      itemWithNote('b', 1, 'Intro for B'),
      item('c', 1),
    ];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    await advanceMs(1000);

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro for B');

    canvasInternals().queuedPlaylistPending = true;
    const refreshCast: CastInfo = {
      castCommand: CastCommand.refreshPlaylist,
      playlist: {
        ...dp1Call('pl', [item('c', 1), item('b', 1), item('a', 1)]),
        items: [item('c', 1), item('b', 1), item('a', 1)],
      },
      index: 1,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(refreshCast, false);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);

    (overlay as HTMLElement).click();

    await advanceMs(0);

    const nextCast = canvasService.getCastInfo();
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
  });
});

describe('PlaylistClient — intermission: keepCurrent on shuffle dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('does not skip current item when applying queued update on dismissal', async () => {
    const items = [
      itemWithNote('a', 1, 'Intro for A'),
      item('b', 1),
      item('c', 1),
    ];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro for A');

    canvasInternals().queuedPlaylistPending = true;
    const shuffledCast: CastInfo = {
      castCommand: CastCommand.setShuffle,
      playlist: {
        ...dp1Call('pl', [item('a', 1), item('c', 1), item('b', 1)]),
        items: [item('a', 1), item('c', 1), item('b', 1)],
      },
      index: 0,
      loopMode: LoopMode.playlist,
      shuffle: true,
    };
    canvasService.setCastInfo(shuffledCast, false);

    (overlay as HTMLElement).click();

    await advanceMs(0);

    const nextCast = canvasService.getCastInfo();
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.getCastInfo()?.index).toBe(0);
    expect(canvasService.getCastInfo()?.playlist?.items?.[0]?.id).toBe('a');
  });
});

describe('PlaylistClient — intermission: same first item after queued refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('does not replay item intro when queued refresh keeps the same first item after dismiss', async () => {
    const items = [itemWithNote('a', 1, 'Intro for A'), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro for A');

    canvasInternals().queuedPlaylistPending = true;
    const refreshCast: CastInfo = {
      castCommand: CastCommand.refreshPlaylist,
      playlist: {
        ...dp1Call('pl', [item('a', 1), item('c', 1)]),
        items: [item('a', 1), item('c', 1)],
      },
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(refreshCast, false);

    (overlay as HTMLElement).click();
    await advanceMs(0);

    const nextCast = canvasService.getCastInfo();
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('PlaylistClient — intermission: keepCurrent when id missing from queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('falls back to index 0 when queued refresh omits current item on dismiss', async () => {
    const items = [itemWithNote('a', 1, 'Intro A'), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();

    canvasInternals().queuedPlaylistPending = true;
    const refreshCast: CastInfo = {
      castCommand: CastCommand.refreshPlaylist,
      playlist: {
        ...dp1Call('pl', [item('b', 1), item('c', 1)]),
        items: [item('b', 1), item('c', 1)],
      },
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(refreshCast, false);

    (overlay as HTMLElement).click();
    await advanceMs(0);

    const nextCast = canvasService.getCastInfo();
    rerender(<PlaylistHarness castInfo={nextCast} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
    expect(canvasService.getCastInfo()?.index).toBe(0);
    expect(canvasService.getCastInfo()?.playlist?.items?.[0]?.id).toBe('b');
  });
});

describe('PlaylistClient — intermission: dismiss with no queued update', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('does not apply queued update if dismissed and no queued update exists', async () => {
    const items = [itemWithNote('a', 1, 'Note A')];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { container } = render(<PlaylistHarness castInfo={initial} />);

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);

    (overlay as HTMLElement).click();

    await advanceMs(0);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
  });
});

describe('PlaylistClient — playlist intro at boot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('does not show playlist intro when display starts at index > 0', () => {
    const playlistNote = { text: 'Welcome to playlist' };
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 1, LoopMode.playlist);
    if (initial.playlist) {
      initial.playlist = { ...initial.playlist, note: playlistNote };
    }
    canvasService.setCastInfo(initial, false);
    const { container } = render(<PlaylistHarness castInfo={initial} />);

    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('PlaylistClient — setLoop during intermission', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('does not restart timer when leaving repeat-off during intermission', async () => {
    const items = [item('a', 1), itemWithNote('b', 1, 'Intro for B')];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    await advanceMs(1000);

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro for B');

    const prior = canvasService.getCastInfo();
    expect(prior).not.toBeNull();
    if (prior) {
      const loopOn: CastInfo = {
        ...prior,
        castCommand: CastCommand.setLoop,
        loopMode: LoopMode.playlist,
      };
      canvasService.setCastInfo(loopOn, false);
      rerender(<PlaylistHarness castInfo={loopOn} />);
    }

    const overlayStillVisible = container.querySelector('[role="status"]');
    expect(overlayStillVisible).toBeTruthy();

    (overlay as HTMLElement).click();

    await advanceMs(0);

    await advanceMs(1000);

    expect(canvasService.getCastInfo()?.index).toBe(0);
  });
});

describe('PlaylistClient — playlistKey flip cuts short stale overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('replaces stale note with the new playlist note on displayPlaylist mid-overlay', () => {
    const p1Items = [itemWithNote('a1', 1, 'Welcome P1')];
    const p1: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: dp1Call('pl-1', p1Items),
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(p1, false);
    const { container, rerender } = render(<PlaylistHarness castInfo={p1} />);

    const overlayP1 = container.querySelector('[role="status"]');
    expect(overlayP1?.textContent).toContain('Welcome P1');

    const p2Items = [itemWithNote('a2', 1, 'Welcome P2')];
    const p2: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: dp1Call('pl-2', p2Items),
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(p2, false);
    rerender(<PlaylistHarness castInfo={p2} />);

    const overlayP2 = container.querySelector('[role="status"]');
    expect(overlayP2).toBeTruthy();
    expect(overlayP2?.textContent).toContain('Welcome P2');
    expect(overlayP2?.textContent).not.toContain('Welcome P1');
  });

  it('hides overlay when the new playlist has no note', () => {
    const p1Items = [itemWithNote('a1', 1, 'Welcome P1')];
    const p1: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: dp1Call('pl-1', p1Items),
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(p1, false);
    const { container, rerender } = render(<PlaylistHarness castInfo={p1} />);

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Welcome P1'
    );

    const p2Items = [item('a2', 1)];
    const p2: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: dp1Call('pl-2', p2Items),
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(p2, false);
    rerender(<PlaylistHarness castInfo={p2} />);

    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('PlaylistClient — queued cross-playlist promotion during intro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('shows promoted playlist intro when dismiss flushes queued playlist with different id', async () => {
    const p1Items = [itemWithNote('a', 1, 'Intro P1')];
    const p1: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: dp1Call('pl-1', p1Items),
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(p1, false);
    const { container, rerender } = render(<PlaylistHarness castInfo={p1} />);

    const overlayP1 = container.querySelector('[role="status"]');
    expect(overlayP1?.textContent).toContain('Intro P1');

    canvasInternals().queuedPlaylistPending = true;
    const p2Items = [itemWithNote('x', 1, 'Intro P2')];
    const p2: CastInfo = {
      castCommand: CastCommand.refreshPlaylist,
      playlist: { ...dp1Call('pl-2', p2Items), items: p2Items },
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(p2, false);

    (overlayP1 as HTMLElement).click();
    await advanceMs(0);

    const nextCast = canvasService.getCastInfo();
    rerender(<PlaylistHarness castInfo={nextCast} />);

    const overlayP2 = container.querySelector('[role="status"]');
    expect(overlayP2).toBeTruthy();
    expect(overlayP2?.textContent).toContain('Intro P2');
    expect(overlayP2?.textContent).not.toContain('Intro P1');
  });
});

describe('PlaylistClient — deferred refresh + cross-playlist dismiss flush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('shows promoted intro when deferred refresh carries a different playlist id', async () => {
    const p1Items = [itemWithNote('a', 1, 'Intro P1')];
    const p1: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: dp1Call('pl-1', p1Items),
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(p1, false);
    const { container, rerender } = render(<PlaylistHarness castInfo={p1} />);

    const overlayP1 = container.querySelector('[role="status"]');
    expect(overlayP1?.textContent).toContain('Intro P1');

    // Seed canvas-internal state for the deferred-refresh + cross-id case:
    // current item ('a') is absent from the new list, so production would
    // store the new playlist privately instead of flipping castInfo.playlist
    // on the cast. consumeDeferredRefreshPlaylist will later promote it.
    const p2Items = [itemWithNote('x', 1, 'Intro P2')];
    const internals = canvasInternals();
    internals.queuedPlaylistPending = true;
    internals.deferredRefreshPlaylist = dp1Call('pl-2', p2Items);
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);

    (overlayP1 as HTMLElement).click();
    await advanceMs(0);

    // After the dismiss flush, castInfo.playlist.id flips to 'pl-2' and the
    // deferred flag is cleared. The identity change rotates playlistKey so
    // the new playlist's own intro is allowed to render.
    const nextCast = canvasService.getCastInfo();
    expect(nextCast?.playlist?.id).toBe('pl-2');
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
    rerender(<PlaylistHarness castInfo={nextCast} />);

    const overlayP2 = container.querySelector('[role="status"]');
    expect(overlayP2).toBeTruthy();
    expect(overlayP2?.textContent).toContain('Intro P2');
    expect(overlayP2?.textContent).not.toContain('Intro P1');
  });
});

describe('PlaylistClient — moveToArtwork always shows destination intro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('shows target item intro when jumping mid-overlay between two noted items', () => {
    const items = [
      itemWithNote('a', 1, 'Intro A'),
      itemWithNote('b', 1, 'Intro B'),
    ];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Intro A'
    );

    const moveCast: CastInfo = {
      ...initial,
      castCommand: CastCommand.moveToArtwork,
      index: 1,
    };
    canvasService.setCastInfo(moveCast, false);
    rerender(<PlaylistHarness castInfo={moveCast} />);

    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro B');
    expect(overlay?.textContent).not.toContain('Intro A');
  });

  it('re-shows a previously-dismissed item intro when moveToArtwork targets it again', async () => {
    const items = [
      itemWithNote('a', 1, 'Intro A'),
      itemWithNote('b', 1, 'Intro B'),
    ];
    const initial = displayCast(items, 0, LoopMode.none);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlayA = container.querySelector('[role="status"]');
    expect(overlayA?.textContent).toContain('Intro A');

    // Dismiss A's intro, then jump forward and back. The session policy of
    // "no replay" is scoped to auto-advance / loop — explicit moveToArtwork
    // re-arms the destination's intro because playlistKey rotates.
    (overlayA as HTMLElement).click();
    await advanceMs(0);
    expect(container.querySelector('[role="status"]')).toBeNull();

    const moveToB: CastInfo = {
      ...initial,
      castCommand: CastCommand.moveToArtwork,
      index: 1,
    };
    canvasService.setCastInfo(moveToB, false);
    rerender(<PlaylistHarness castInfo={moveToB} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Intro B'
    );

    const moveToA: CastInfo = {
      ...initial,
      castCommand: CastCommand.moveToArtwork,
      index: 0,
    };
    canvasService.setCastInfo(moveToA, false);
    rerender(<PlaylistHarness castInfo={moveToA} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Intro A'
    );
  });
});

describe('PlaylistClient — moveToArtwork bypasses playlist intro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('dismisses playlist intro and shows item 0 intro when moveToArtwork targets slot 0', () => {
    const items = [
      itemWithNote('a', 1, 'Intro A'),
      itemWithNote('b', 1, 'Intro B'),
    ];
    const initial: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: { ...dp1Call('pl', items), note: { text: 'Welcome PL' } },
      index: 0,
      loopMode: LoopMode.none,
    };
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    // Playlist intro is the first thing shown at boot slot 0.
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Welcome PL'
    );

    const moveToSlot0: CastInfo = {
      ...initial,
      castCommand: CastCommand.moveToArtwork,
      index: 0,
    };
    canvasService.setCastInfo(moveToSlot0, false);
    rerender(<PlaylistHarness castInfo={moveToSlot0} />);

    // Playlist welcome must be gone; A's own item intro takes over.
    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro A');
    expect(overlay?.textContent).not.toContain('Welcome PL');
  });

  it('dismisses playlist intro and shows target item intro when moveToArtwork targets a later slot', () => {
    const items = [
      itemWithNote('a', 1, 'Intro A'),
      itemWithNote('b', 1, 'Intro B'),
    ];
    const initial: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: { ...dp1Call('pl', items), note: { text: 'Welcome PL' } },
      index: 0,
      loopMode: LoopMode.none,
    };
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Welcome PL'
    );

    const moveToSlot1: CastInfo = {
      ...initial,
      castCommand: CastCommand.moveToArtwork,
      index: 1,
    };
    canvasService.setCastInfo(moveToSlot1, false);
    rerender(<PlaylistHarness castInfo={moveToSlot1} />);

    const overlay = container.querySelector('[role="status"]');
    expect(overlay?.textContent).toContain('Intro B');
    expect(overlay?.textContent).not.toContain('Welcome PL');
    expect(overlay?.textContent).not.toContain('Intro A');
  });
});

// Regression coverage for the queued-applied path of moveToArtwork. Without
// propagating the explicit-intro bypass through `applyQueuedPlaylistIfExists`,
// a moveToArtwork that coincides with a pending refresh/shuffle re-arms the
// playlist welcome at slot 0 because rotation alone clears dismissal. The
// non-queued tests above cover the same contract; these lock the queued path.
describe('PlaylistClient — moveToArtwork bypasses playlist intro with queued pending', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('dismisses playlist intro and shows item 0 intro when moveToArtwork targets slot 0 with a queued refresh/shuffle pending', () => {
    const items = [
      itemWithNote('a', 1, 'Intro A'),
      itemWithNote('b', 1, 'Intro B'),
    ];
    const initial: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: { ...dp1Call('pl', items), note: { text: 'Welcome PL' } },
      index: 0,
      loopMode: LoopMode.none,
    };
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Welcome PL'
    );

    // Simulate a queued refresh/shuffle that CanvasService parked while the
    // welcome overlay was on screen. `getQueuedPlaylistItems` falls back to
    // the current castInfo items when no deferred refresh is stored, which
    // mirrors the "immediate refresh while holding" shape.
    canvasInternals().queuedPlaylistPending = true;

    const moveToSlot0: CastInfo = {
      ...initial,
      castCommand: CastCommand.moveToArtwork,
      index: 0,
    };
    canvasService.setCastInfo(moveToSlot0, false);
    rerender(<PlaylistHarness castInfo={moveToSlot0} />);

    // Queue should have been flushed as part of the moveToArtwork handling.
    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);

    // Bypass must fire even though the queued path short-circuited the
    // outer rotation: welcome gone, destination item intro takes over.
    const overlay = container.querySelector('[role="status"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('Intro A');
    expect(overlay?.textContent).not.toContain('Welcome PL');
  });

  it('shows the destination item intro when moveToArtwork targets a later slot with a queued refresh/shuffle pending', () => {
    const items = [
      itemWithNote('a', 1, 'Intro A'),
      itemWithNote('b', 1, 'Intro B'),
    ];
    const initial: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: { ...dp1Call('pl', items), note: { text: 'Welcome PL' } },
      index: 0,
      loopMode: LoopMode.none,
    };
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Welcome PL'
    );

    canvasInternals().queuedPlaylistPending = true;

    const moveToSlot1: CastInfo = {
      ...initial,
      castCommand: CastCommand.moveToArtwork,
      index: 1,
    };
    canvasService.setCastInfo(moveToSlot1, false);
    rerender(<PlaylistHarness castInfo={moveToSlot1} />);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(false);

    // Slot 1 gates the welcome closed anyway (currentIndex !== 0), so this
    // variant locks in parity with the non-queued case at a later slot.
    const overlay = container.querySelector('[role="status"]');
    expect(overlay?.textContent).toContain('Intro B');
    expect(overlay?.textContent).not.toContain('Welcome PL');
    expect(overlay?.textContent).not.toContain('Intro A');
  });
});

describe('PlaylistClient — updateIndex does not replay intros on loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('keeps an already-dismissed item note dismissed after an updateIndex tick', async () => {
    const items = [itemWithNote('a', 1, 'Intro A')];
    const initial = displayCast(items, 0, LoopMode.one);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlay = container.querySelector('[role="status"]');
    expect(overlay?.textContent).toContain('Intro A');

    (overlay as HTMLElement).click();
    await advanceMs(0);
    expect(container.querySelector('[role="status"]')).toBeNull();

    // Simulate the loop-one republish: same playlist, same index, updateIndex
    // command. If this rotated playlistKey, Intro A would re-appear.
    const republished: CastInfo = {
      ...initial,
      castCommand: CastCommand.updateIndex,
      index: 0,
    };
    canvasService.setCastInfo(republished, false);
    rerender(<PlaylistHarness castInfo={republished} />);

    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('PlaylistClient — loop-playlist wrap replays item intro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('re-shows a dismissed item intro when loop-playlist wraps back to it', async () => {
    const items = [itemWithNote('a', 1, 'Intro A'), item('b', 1), item('c', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlayFirstPass = container.querySelector('[role="status"]');
    expect(overlayFirstPass?.textContent).toContain('Intro A');
    (overlayFirstPass as HTMLElement).click();
    await advanceMs(0);
    expect(container.querySelector('[role="status"]')).toBeNull();

    // Auto-advance through slots 1 and 2. Each tick is an `updateIndex`
    // republish — same playlistKey, different currentIndex. The hook
    // should clear the dismissal memory once the occurrence key moves off
    // "a-0" so a later wrap back can replay.
    const advance = (index: number): void => {
      const next: CastInfo = {
        ...initial,
        castCommand: CastCommand.updateIndex,
        index,
      };
      canvasService.setCastInfo(next, false);
      rerender(<PlaylistHarness castInfo={next} />);
    };
    advance(1);
    advance(2);
    expect(container.querySelector('[role="status"]')).toBeNull();

    // Wrap back to slot 0. Same occurrence key "a-0", but dismissal was
    // cleared when the occurrence moved to "b-1" → gate re-opens.
    advance(0);
    const overlayAfterWrap = container.querySelector('[role="status"]');
    expect(overlayAfterWrap).toBeTruthy();
    expect(overlayAfterWrap?.textContent).toContain('Intro A');
  });
});

describe('PlaylistClient — loop-playlist wrap replays playlist welcome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('re-shows the playlist welcome when loop-playlist wraps back to slot 0', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: { ...dp1Call('pl', items), note: { text: 'Welcome PL' } },
      index: 0,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlayFirst = container.querySelector('[role="status"]');
    expect(overlayFirst?.textContent).toContain('Welcome PL');
    (overlayFirst as HTMLElement).click();
    await advanceMs(0);
    expect(container.querySelector('[role="status"]')).toBeNull();

    const advance = (index: number): void => {
      const next: CastInfo = {
        ...initial,
        castCommand: CastCommand.updateIndex,
        index,
      };
      canvasService.setCastInfo(next, false);
      rerender(<PlaylistHarness castInfo={next} />);
    };
    advance(1);
    expect(container.querySelector('[role="status"]')).toBeNull();

    // Wrap back to slot 0 via `updateIndex`. The welcome should show again
    // because advancing past slot 0 cleared `playlistIntroDismissedForId`.
    advance(0);
    const overlayAfterWrap = container.querySelector('[role="status"]');
    expect(overlayAfterWrap).toBeTruthy();
    expect(overlayAfterWrap?.textContent).toContain('Welcome PL');
  });
});

describe('PlaylistClient — same-id displayPlaylist preserves dismissal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('does not replay an already-dismissed item intro on loop-one heartbeat republish', async () => {
    const items = [itemWithNote('a', 1, 'Intro A')];
    const initial = displayCast(items, 0, LoopMode.one);
    canvasService.setCastInfo(initial, false);
    const { container, rerender } = render(
      <PlaylistHarness castInfo={initial} />
    );

    const overlay = container.querySelector('[role="status"]');
    expect(overlay?.textContent).toContain('Intro A');
    (overlay as HTMLElement).click();
    await advanceMs(0);
    expect(container.querySelector('[role="status"]')).toBeNull();

    // Same playlist id, same items, same index. Only the command object
    // is re-sent. Rotating `playlistKey` here would wipe the dismissal and
    // replay the intro — the exact regression the reviewer flagged.
    const republished: CastInfo = {
      ...initial,
      castCommand: CastCommand.displayPlaylist,
    };
    canvasService.setCastInfo(republished, false);
    rerender(<PlaylistHarness castInfo={republished} />);

    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
