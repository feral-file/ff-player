/**
 * The stuck-load watchdog follows transfer progress, not wall time: on an
 * FF1 a 20 MB still needs ~27 s, which the former fixed 15 s bound failed on
 * every attempt. These cover the renderer wiring: a loader's progress and
 * phase reports reach the slot's watchdog, a video's own `progress` events
 * do too, and a transfer that stops is still failed into the ordinary
 * retry budget.
 */
import { AppContext } from '@/context/AppContext';
import { RenderStatus } from '@/models';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';
import {
  LOAD_DECODE_TIMEOUT_MS,
  LOAD_IDLE_TIMEOUT_MS,
} from './LoadWatchdog';

const loader = vi.hoisted(() => ({
  calls: 0,
  onLoad: undefined as (() => void) | undefined,
  onProgress: undefined as (() => void) | undefined,
  onPhase: undefined as ((phase: 'decode' | 'opaque') => void) | undefined,
}));

// Never settles on its own: each test drives progress, phase and completion.
vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => ({
      loadMedia: (options: {
        onLoad?: () => void;
        onProgress?: () => void;
        onPhase?: (phase: 'decode' | 'opaque') => void;
      }) => {
        loader.calls += 1;
        loader.onLoad = options.onLoad;
        loader.onProgress = options.onProgress;
        loader.onPhase = options.onPhase;
        return undefined;
      },
      cleanup: () => undefined,
    }),
  };
});

function player(previewURL: string, mimeType: string) {
  const value = {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig: {},
      displaySettings: null,
      cursorPositions: null,
      castInfo: null,
    },
  };
  return (
    <AppContext.Provider value={value as never}>
      <ArtworkPlayer
        previewURL={previewURL}
        artworkPreviewMIMEType={mimeType}
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity="tezos:mainnet:fa2:KT1slow:1"
      />
    </AppContext.Provider>
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function status() {
  return canvasService.getStatus().renderStatus;
}

afterEach(() => {
  cleanup();
  loader.calls = 0;
  loader.onLoad = undefined;
  loader.onProgress = undefined;
  loader.onPhase = undefined;
  vi.useRealTimers();
  canvasService.setCastInfo(null, false);
  canvasService.setRenderStatus(undefined);
  canvasService.setRenderLoadBounded(false);
});

describe('ArtworkPlayer — progress-aware load watchdog', () => {
  it('lets a slow still keep loading while bytes arrive, then commits it', async () => {
    vi.useFakeTimers();
    render(player('https://ipfs.feralfile.com/ipfs/QmSlow', 'image/jpeg'));
    await advance(0);
    // The mount's watchdog marks the load bounded for the playlist timer.
    expect(canvasService.isRenderLoadBounded()).toBe(true);

    // A minute of steady transfer, three idle bounds long.
    for (let elapsed = 0; elapsed < 3 * LOAD_IDLE_TIMEOUT_MS; elapsed += 5000) {
      await advance(5000);
      loader.onProgress?.();
    }
    expect(status()).toBe(RenderStatus.loading);
    expect(loader.calls).toBe(1);

    await act(async () => {
      loader.onPhase?.('decode');
      loader.onLoad?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(status()).toBe(RenderStatus.ready);
  });

  it('fails a still whose transfer stops, one idle bound after the last bytes', async () => {
    vi.useFakeTimers();
    render(player('https://ipfs.feralfile.com/ipfs/QmStall', 'image/jpeg'));
    await advance(0);

    await advance(LOAD_IDLE_TIMEOUT_MS - 1000);
    loader.onProgress?.();
    await advance(LOAD_IDLE_TIMEOUT_MS - 1);
    expect(status()).toBe(RenderStatus.loading);
    await advance(1);
    expect(status()).toBe(RenderStatus.failed);
  });

  it('fails a still whose bytes completed but never decoded, after the decode window', async () => {
    vi.useFakeTimers();
    render(player('https://ipfs.feralfile.com/ipfs/QmNoDecode', 'image/jpeg'));
    await advance(0);

    await advance(LOAD_IDLE_TIMEOUT_MS - 1000);
    loader.onPhase?.('decode');
    await advance(LOAD_DECODE_TIMEOUT_MS - 1);
    expect(status()).not.toBe(RenderStatus.failed);
    await advance(1);
    expect(status()).toBe(RenderStatus.failed);
  });

  it("keeps a video alive on the element's own progress events", async () => {
    vi.useFakeTimers();
    const { container } = render(
      player('https://example.com/large.mp4', 'video/mp4')
    );
    await advance(0);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();

    for (let elapsed = 0; elapsed < 3 * LOAD_IDLE_TIMEOUT_MS; elapsed += 5000) {
      await advance(5000);
      video?.dispatchEvent(new Event('progress'));
    }
    expect(status()).toBe(RenderStatus.loading);

    await advance(LOAD_IDLE_TIMEOUT_MS);
    expect(status()).toBe(RenderStatus.failed);
  });
});
