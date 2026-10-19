/**
 * Bounded retry-then-skip for a work that terminally fails to render
 * (feral-file/ff-player#307): a collector shuffling a large Tezos playlist
 * on an FF1 saw one work get stuck reloading forever, leaving the device
 * unresponsive until a hard reset. Before this, `handleArtworkRenderFailure`
 * showed a static "cannot be displayed" modal and never retried or advanced
 * the playlist — a broken work parked there indefinitely. This now retries
 * the same item in place up to ARTWORK_FAILURE_RETRY_LIMIT (3) times, then
 * calls `onArtworkExhausted` so the consumer (PlaylistClient) moves on.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { act, cleanup, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const loaderState = vi.hoisted(() => ({
  loadCalls: 0,
  mode: 'fail' as 'fail' | 'hang',
}));

vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => ({
      loadMedia: (options: { onError?: (error: Error) => void }) => {
        loaderState.loadCalls += 1;
        if (loaderState.mode === 'fail') {
          // Every attempt fails immediately — the item never recovers on
          // its own, so the retry-then-skip budget is the only thing that
          // can move the playlist past it.
          options.onError?.(new Error('load failed'));
        }
        // 'hang' mode calls neither onLoad nor onError — simulating a
        // mediaLoader fetch that never settles (feral-file/ff-player#307's
        // actual root cause: a gateway that accepts the connection but
        // never replies). Only the stuck-load watchdog can notice this.
        return undefined;
      },
      cleanup: () => undefined,
    }),
  };
});

const ITEM_IDENTITY = 'tezos:mainnet:fa2:KT1stuck:1';
const PREVIEW_URL = 'https://feralfile.com/test/stuck-work.jpg';

function playerNode(onArtworkExhausted: (itemIdentity: string) => void) {
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
        previewURL={PREVIEW_URL}
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={ITEM_IDENTITY}
        onArtworkExhausted={onArtworkExhausted}
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
  loaderState.mode = 'fail';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ArtworkPlayer — bounded retry-then-skip on repeated render failure', () => {
  it('retries in place twice, then hands off to onArtworkExhausted on the third failure', async () => {
    vi.useFakeTimers();
    const onArtworkExhausted = vi.fn();
    render(playerNode(onArtworkExhausted));

    // Initial attempt fails.
    await advanceTimersBy(0);
    expect(loaderState.loadCalls).toBe(1);
    expect(onArtworkExhausted).not.toHaveBeenCalled();

    // First retry (ARTWORK_FAILURE_RETRY_DELAY_MS later) — still under the
    // limit, so it retries in place instead of giving up.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(2);
    expect(onArtworkExhausted).not.toHaveBeenCalled();

    // Second retry is the 3rd attempt overall — the limit. The player must
    // stop retrying and hand off instead.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(3);
    expect(onArtworkExhausted).toHaveBeenCalledTimes(1);
    expect(onArtworkExhausted).toHaveBeenCalledWith(ITEM_IDENTITY);

    // No further retry beyond the limit, however long the device waits —
    // this is the device-stays-controllable half of the fix: a dead work
    // cannot keep reloading forever on its own.
    await advanceTimersBy(60_000);
    expect(loaderState.loadCalls).toBe(3);
    expect(onArtworkExhausted).toHaveBeenCalledTimes(1);
  });
});

describe('ArtworkPlayer — stuck-load watchdog drives the same retry-then-skip budget', () => {
  it('treats a load that never calls onLoad or onError as a failure, feeding the same budget a real error does', async () => {
    // feral-file/ff-player#307's own root cause: a gateway that accepts the
    // connection but never replies leaves onLoad/onError unreachable — only
    // ARTWORK_LOAD_WATCHDOG_MS (15s, hardcoded here: the constant is not
    // exported, matching this file's own existing convention for
    // ARTWORK_FAILURE_RETRY_DELAY_MS above) notices. One watchdog-driven
    // cycle is enough to prove the integration — the 3-attempt counting and
    // exhaustion behavior itself is already covered end to end by the
    // synchronous-onError describe block above, which this one must feed
    // the exact same way.
    vi.useFakeTimers();
    loaderState.mode = 'hang';
    const onArtworkExhausted = vi.fn();
    render(playerNode(onArtworkExhausted));
    await advanceTimersBy(0);

    // Nothing ever settles. Only the watchdog can notice.
    await advanceTimersBy(15000);
    expect(loaderState.loadCalls).toBe(1);
    expect(onArtworkExhausted).not.toHaveBeenCalled();

    // A retry fires after the normal ARTWORK_FAILURE_RETRY_DELAY_MS — only
    // reachable if the watchdog's failure called
    // scheduleArtworkFailureRetryOrSkip, the same function the
    // synchronous-onError path calls.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(2);
    expect(onArtworkExhausted).not.toHaveBeenCalled();
  });
});
