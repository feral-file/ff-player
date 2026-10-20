/**
 * Regression for run-reviewer bot-round-3 pass-5 F3: the branch's own
 * "Decision needed" line (docs/DEVICE_LOCAL_PLAYER.md, PR body `Decisions`)
 * originally said AppContext's M7 reconnect-recovery effect "occasionally"
 * races the local retry-then-skip budget. It is not occasional — M7 fires
 * its own, near-instant refresh on the FIRST failure of any newly-degraded
 * URL (AppContext.reconnectRecovery.test.tsx's own "refreshes as soon as
 * the artwork reports a failed load" already proves that in isolation), and
 * `handleMediaError`/`handleLoadIframeError`/`handleModelLoadError` call
 * `notePlaybackOutcome(url, true)` on the exact same failure that also
 * feeds this budget. This locks in the actual, collapsed timeline through
 * ArtworkPlayer's own observable behavior: a `setPlaybackDegraded` stub
 * that fires an immediate reload on a URL's first degraded report — the
 * same shape M7's own real effect produces — must still only cost the
 * documented 3-attempt budget (device stays controllable), just paced to
 * roughly one window, not two or three.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { act, cleanup, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const loaderState = vi.hoisted(() => ({ loadCalls: 0 }));

vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => ({
      loadMedia: (options: { onError?: (error: Error) => void }) => {
        loaderState.loadCalls += 1;
        options.onError?.(new Error('load failed'));
        return undefined;
      },
      cleanup: () => undefined,
    }),
  };
});

const ITEM_IDENTITY = 'tezos:mainnet:fa2:KT1m7race:1';
const PREVIEW_URL = 'https://feralfile.com/test/m7-race-work.jpg';

function playerNode(
  onArtworkExhausted: (itemIdentity: string) => void,
  onRegisterArtworkReload: (reload: (() => void) | null) => void,
  setPlaybackDegraded: (degraded: boolean, url?: string) => void
) {
  const value = {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig: {},
      displaySettings: null,
      cursorPositions: null,
      castInfo: null,
      playbackDegraded: false,
      setPlaybackDegraded,
    },
  };
  return (
    <AppContext.Provider value={value as never}>
      <ArtworkPlayer
        previewURL={PREVIEW_URL}
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={ITEM_IDENTITY}
        onArtworkExhausted={onArtworkExhausted}
        onRegisterArtworkReload={onRegisterArtworkReload}
      />
    </AppContext.Provider>
  );
}

async function advanceTimersBy(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  cleanup();
  loaderState.loadCalls = 0;
  vi.useRealTimers();
});

describe('ArtworkPlayer — M7s immediate refresh on a fresh degraded URL collapses the local retry pacing', () => {
  it('still exhausts within the documented 3-attempt budget, just paced to roughly one window instead of two or three', async () => {
    vi.useFakeTimers();
    const onArtworkExhausted = vi.fn();
    let reload: (() => void) | null = null;
    let alreadyDegraded = false;
    // Faithful to AppContext's own M7 effect (proven in
    // AppContext.reconnectRecovery.test.tsx's "refreshes as soon as the
    // artwork reports a failed load"): a URL's FIRST degraded report fires
    // an immediate refresh, with no backoff wait; a later report for the
    // SAME already-degraded URL does not re-fire.
    const setPlaybackDegraded = vi.fn((degraded: boolean) => {
      if (degraded && !alreadyDegraded) {
        alreadyDegraded = true;
        reload?.();
      }
    });

    render(
      playerNode(
        onArtworkExhausted,
        fn => {
          reload = fn;
        },
        setPlaybackDegraded
      )
    );

    // First failure (t=0): the local budget schedules its own 3s retry, but
    // the M7 stub's immediate reload collapses it — attempt 2 lands in the
    // same tick, not 3000ms later.
    await advanceTimersBy(0);
    expect(setPlaybackDegraded).toHaveBeenCalledWith(true, PREVIEW_URL);
    expect(loaderState.loadCalls).toBe(2);
    expect(onArtworkExhausted).not.toHaveBeenCalled();

    // Only the local budget's own pacing remains from here — M7 already
    // fired once and does not fire again for the same URL. The 3rd and
    // final attempt is 3s after that collapsed pair, not 6-9s.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(3);
    expect(onArtworkExhausted).toHaveBeenCalledTimes(1);
    expect(onArtworkExhausted).toHaveBeenCalledWith(ITEM_IDENTITY);
  });
});
