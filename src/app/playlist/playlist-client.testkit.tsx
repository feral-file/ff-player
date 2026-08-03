/**
 * Shared test helpers for PlaylistClient suites. Not a `.test.` file so
 * vitest does not discover it as a suite of its own; both
 * `playlist-client.test.tsx` and `playlist-client.sourceEnd.test.tsx`
 * import from here to keep their individual files under the project's
 * 500-line file lint cap and to avoid duplicated harness code drifting
 * across suites.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand, RenderStatus } from '@/models';
import type { CastInfo } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act } from '@testing-library/react';
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

export async function advanceMs(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

export function teardownPlaylistWiringTest(): void {
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

/**
 * Drive ArtworkPlayer's onRenderStatusChange prop. Emitting `ready` models a
 * healthy loaded item, which disarms the render watchdog (ff-app#520) so a
 * no-duration item advances only on source-end, matching production where the
 * render layer always reports `ready` on a successful load.
 */
export function emitRenderStatus(status: RenderStatus | undefined): void {
  const cb = (
    globalThis as { __artworkPlayerProps?: Record<string, unknown> }
  ).__artworkPlayerProps?.onRenderStatusChange as
    | ((s: RenderStatus | undefined) => void)
    | undefined;
  if (!cb) {
    throw new Error(
      'onRenderStatusChange was not wired through to ArtworkPlayer'
    );
  }
  act(() => {
    cb(status);
  });
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

export function callOnSourceEndedRaw(identity: string): void {
  const onSourceEnded = (
    globalThis as { __artworkPlayerProps?: Record<string, unknown> }
  ).__artworkPlayerProps?.onSourceEnded as
    | ((identity: string) => void)
    | undefined;
  onSourceEnded?.(identity);
}
