/**
 * Wiring tests: `PlaylistClient` consumes `castInfo` from `AppContext` while
 * `applyQueuedPlaylistIfExists` reads `canvasService`. Each scenario keeps both
 * aligned the same way the live route would after a cast update. Deferred
 * refresh is staged via the same `CanvasService.refreshPlaylist` path the CDP
 * handler uses before the player applies it on hold.
 *
 * Real `ArtworkPlayer` reload / media setup is covered in
 * `ArtworkPlayer.refresh.test.tsx` (this file mocks `ArtworkPlayer`).
 */
import { AppContext } from '@/context/AppContext';
import { NO_DURATION_VALUE } from '@/constants';
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaylistClient from './playlist-client';

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function MockArtworkPlayer(props: Record<string, unknown>) {
    const g = globalThis as {
      __artworkPlayerProps?: Record<string, unknown>;
      __artworkReloadInvocations?: number;
    };
    g.__artworkPlayerProps = props;
    React.useLayoutEffect(() => {
      const reg = props.onRegisterArtworkReload as
        | ((fn: (() => void) | null) => void)
        | undefined;
      if (!reg) {
        return;
      }
      const reload = () => {
        g.__artworkReloadInvocations = (g.__artworkReloadInvocations ?? 0) + 1;
      };
      reg(reload);
      return () => {
        reg(null);
      };
      // Test double: `g` is a module-level probe on globalThis, not a hook dep.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    }, [props.onRegisterArtworkReload]);
    return null;
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

function canvasInternals(): {
  queuedPlaylistPending: boolean;
  deferredRefreshPlaylist: unknown;
  originalPlaylistItems: unknown;
  refreshPlaylist: (newItems: DP1Item[] | undefined) => { ok: boolean };
} {
  return canvasService as unknown as {
    queuedPlaylistPending: boolean;
    deferredRefreshPlaylist: unknown;
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

function PlaylistHarness(props: { castInfo: CastInfo | null }): React.ReactElement {
  const value = React.useMemo(
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
  const g = globalThis as {
    __artworkPlayerProps?: Record<string, unknown>;
    __artworkReloadInvocations?: number;
  };
  g.__artworkPlayerProps = undefined;
  g.__artworkReloadInvocations = undefined;
}

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

      const reply = canvasInternals().refreshPlaylist([item('a', 1), item('c', 1)]);
      expect(reply).toEqual({ ok: true });
      expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);

      const nextCast = canvasService.getCastInfo();
      if (nextCast === null) {
        throw new Error('expected castInfo after deferred refreshPlaylist');
      }
      rerender(<PlaylistHarness castInfo={nextCast} />);

      expect(canvasService.hasQueuedPlaylistPending()).toBe(false);
      expect(canvasService.hasDeferredRefreshPlaylist()).toBe(false);
      expect(canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)).toEqual([
        'a',
        'c',
      ]);
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

describe('PlaylistClient — refresh artwork', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('refreshes ArtworkPlayer preview URL when refreshArtwork is received', async () => {
    const items = [item('a', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);
    const initialPreviewURL = (
      globalThis as { __artworkPlayerProps?: Record<string, unknown> }
    ).__artworkPlayerProps?.previewURL as string | undefined;
    expect(initialPreviewURL).toBe('https://example.com/a.jpg');

    const reply = canvasService.processMessage({
      command: CastCommand.refreshArtwork,
      request: {},
    });
    expect(reply).toEqual({ ok: true });

    await act(async () => {
      await Promise.resolve();
    });

    const refreshedPreviewURL = (
      globalThis as { __artworkPlayerProps?: Record<string, unknown> }
    ).__artworkPlayerProps?.previewURL as string | undefined;
    expect(refreshedPreviewURL).toBe('https://example.com/a.jpg');
    expect(
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations
    ).toBe(1);
  });

  it('refreshes the committed active artwork right after index transition', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { rerender } = render(<PlaylistHarness castInfo={initial} />);

    const moveToNext: CastInfo = {
      castCommand: CastCommand.updateIndex,
      playlist: dp1Call('pl', items),
      index: 1,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(moveToNext, false);
    rerender(<PlaylistHarness castInfo={moveToNext} />);

    const reply = canvasService.processMessage({
      command: CastCommand.refreshArtwork,
      request: {},
    });
    expect(reply).toEqual({ ok: true });

    await act(async () => {
      await Promise.resolve();
    });

    const refreshedPreviewURL = (
      globalThis as { __artworkPlayerProps?: Record<string, unknown> }
    ).__artworkPlayerProps?.previewURL as string | undefined;
    expect(refreshedPreviewURL).toBe('https://example.com/b.jpg');
    expect(
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations
    ).toBe(1);
  });
});


describe('PlaylistClient — refresh artwork (cast leads React)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('uses castInfo index for refreshArtwork before React applies updateIndex (no rerender)', async () => {
    const items = [item('a', 1), item('b', 1)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    const moveToNext: CastInfo = {
      castCommand: CastCommand.updateIndex,
      playlist: dp1Call('pl', items),
      index: 1,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(moveToNext, false);

    const reply = canvasService.processMessage({
      command: CastCommand.refreshArtwork,
      request: {},
    });
    expect(reply).toEqual({ ok: true });

    await act(async () => {
      await Promise.resolve();
    });

    const refreshedPreviewURL = (
      globalThis as { __artworkPlayerProps?: Record<string, unknown> }
    ).__artworkPlayerProps?.previewURL as string | undefined;
    expect(refreshedPreviewURL).toBe('https://example.com/b.jpg');
    expect(
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations
    ).toBe(1);
  });
});
