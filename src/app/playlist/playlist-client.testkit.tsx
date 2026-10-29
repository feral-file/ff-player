/**
 * Shared test helpers for PlaylistClient suites. Not a `.test.` file so
 * vitest does not discover it as a suite of its own; both
 * `playlist-client.test.tsx` and `playlist-client.sourceEnd.test.tsx`
 * import from here to keep their individual files under the project's
 * 500-line file lint cap and to avoid duplicated harness code drifting
 * across suites.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup } from '@testing-library/react';
import * as React from 'react';
import { vi } from 'vitest';
import PlaylistClient from './playlist-client';

export function canvasInternals(): {
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

export function dp1Call(id: string, items: DP1Item[]): DP1Call {
  return {
    dpVersion: '1',
    id,
    title: id,
    items,
  };
}

export function item(id: string, durationSeconds: number): DP1Item {
  return {
    id,
    source: `https://example.com/${id}.jpg`,
    license: {},
    duration: durationSeconds,
  } as DP1Item;
}

export function displayCast(
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

export function PlaylistHarness(props: {
  castInfo: CastInfo | null;
}): React.ReactElement {
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

/** Mirrors AppProvider's CanvasService subscription for command replay tests. */
export function LivePlaylistHarness(): React.ReactElement {
  const [castInfo, setCastInfo] = React.useState<CastInfo | null>(() =>
    canvasService.getCastInfo()
  );

  React.useEffect(() => {
    canvasService.onCastInfoChange = nextCastInfo => {
      setCastInfo(nextCastInfo);
    };
    return () => {
      canvasService.onCastInfoChange = null;
    };
  }, []);

  return <PlaylistHarness castInfo={castInfo} />;
}

export async function advanceMs(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

export function teardownPlaylistWiringTest(): void {
  // Unmounts every tree still rendered by this test, so a pending slot
  // timer it left scheduled (a finite-duration slot whose test ended before
  // advancing past it) cannot later fire against a different suite's fake
  // clock and overwrite the shared ArtworkPlayer probe with a stale item.
  cleanup();
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

export function callSourceEnded(endedIdentity: string): void {
  const onSourceEnded = (
    globalThis as { __artworkPlayerProps?: Record<string, unknown> }
  ).__artworkPlayerProps?.onSourceEnded as
    | ((identity: string) => void)
    | undefined;
  if (!onSourceEnded) {
    throw new Error('onSourceEnded was not wired through to ArtworkPlayer');
  }
  act(() => {
    onSourceEnded(endedIdentity);
  });
}

export function callArtworkExhausted(failedIdentity: string): void {
  const onArtworkExhausted = (
    globalThis as { __artworkPlayerProps?: Record<string, unknown> }
  ).__artworkPlayerProps?.onArtworkExhausted as
    | ((identity: string) => void)
    | undefined;
  if (!onArtworkExhausted) {
    throw new Error('onArtworkExhausted was not wired through to ArtworkPlayer');
  }
  act(() => {
    onArtworkExhausted(failedIdentity);
  });
}

export function callOnSourceEndedRaw(identity: string): void {
  const onSourceEnded = (
    globalThis as { __artworkPlayerProps?: Record<string, unknown> }
  ).__artworkPlayerProps?.onSourceEnded as
    | ((identity: string) => void)
    | undefined;
  onSourceEnded?.(identity);
}
