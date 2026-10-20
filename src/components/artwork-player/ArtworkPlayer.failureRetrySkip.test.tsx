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
import { RenderStatus } from '@/models';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const loaderState = vi.hoisted(() => ({
  loadCalls: 0,
  mode: 'fail' as 'fail' | 'hang' | 'lateSuccess',
  lastOnLoad: undefined as (() => void) | undefined,
  lastSignal: undefined as AbortSignal | undefined,
}));

vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => ({
      loadMedia: (options: {
        onLoad?: () => void;
        onError?: (error: Error) => void;
        signal?: AbortSignal;
      }) => {
        loaderState.loadCalls += 1;
        loaderState.lastSignal = options.signal;
        if (loaderState.mode === 'fail') {
          // Every attempt fails immediately — the item never recovers on
          // its own, so the retry-then-skip budget is the only thing that
          // can move the playlist past it.
          options.onError?.(new Error('load failed'));
        } else if (loaderState.mode === 'lateSuccess') {
          // Neither onLoad nor onError fires yet — the test calls onLoad
          // itself once it wants the "real load" to finally settle.
          loaderState.lastOnLoad = options.onLoad;
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

const IFRAME_PREVIEW_URL = 'https://feralfile.com/test/stuck-generative/';

function iframePlayerNode(onArtworkExhausted: (itemIdentity: string) => void) {
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
        previewURL={IFRAME_PREVIEW_URL}
        artworkPreviewMIMEType="text/html"
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
  loaderState.lastOnLoad = undefined;
  loaderState.lastSignal = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
  canvasService.setCastInfo(null, false);
  canvasService.setRenderStatus(undefined);
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
    const firstSignal = loaderState.lastSignal;
    await advanceTimersBy(15000);
    expect(loaderState.loadCalls).toBe(1);
    expect(onArtworkExhausted).not.toHaveBeenCalled();
    // run-reviewer bot-round-2 pass-3 F2: the still-in-flight fetch for this
    // now-failed attempt must be aborted immediately, not left open until an
    // unrelated later commit nulls this slot.
    expect(firstSignal?.aborted).toBe(true);

    // A retry fires after the normal ARTWORK_FAILURE_RETRY_DELAY_MS — only
    // reachable if the watchdog's failure called
    // scheduleArtworkFailureRetryOrSkip, the same function the
    // synchronous-onError path calls.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(2);
    expect(onArtworkExhausted).not.toHaveBeenCalled();
  });
});

describe('ArtworkPlayer — a late real success cancels a watchdog-scheduled retry', () => {
  it('does not force a reload when the real load succeeds between the watchdog firing and the scheduled retry', async () => {
    // run-reviewer pass 5, F2: the watchdog fires at 15s (slot still
    // pending), marks the slot failed, and schedules a retry
    // ARTWORK_FAILURE_RETRY_DELAY_MS (3s) later. If the REAL load was only
    // slow — not actually stuck — and its own onLoad arrives in that 3s
    // window, the scheduled retry must not fire a second, gratuitous reload
    // on top of content that just finished loading fine.
    vi.useFakeTimers();
    loaderState.mode = 'lateSuccess';
    const onArtworkExhausted = vi.fn();
    render(playerNode(onArtworkExhausted));
    await advanceTimersBy(0);
    expect(loaderState.loadCalls).toBe(1);

    // Watchdog fires: marks failed, schedules the retry.
    await advanceTimersBy(15000);

    // Watchdog fired: the slot reads failed and shows the error modal.
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);

    // The real load finally succeeds, inside the retry's 3s backoff window.
    await act(async () => {
      loaderState.lastOnLoad?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    // feralfile-bot review of PR #310, round 2: cancelling the retry is not
    // enough on its own — the late success must actually restore `ready`
    // and clear the error modal, or the device is left showing a failure
    // for content that is, underneath, loaded and fine.
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(
      screen.queryByText(
        'The artwork cannot be displayed correctly on this device.'
      )
    ).toBeNull();

    // The scheduled retry must have been cancelled by the late success —
    // no second, gratuitous reload of content that already loaded fine.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(1);
    expect(onArtworkExhausted).not.toHaveBeenCalled();
  });
});

describe('ArtworkPlayer — embedded-heavy content gets a longer stuck-load watchdog window', () => {
  /**
   * Regression for run-reviewer bot-round-2 pass-2 F1: iframe/object/model
   * loads had no time bound at all before this branch — the generic
   * ARTWORK_LOAD_WATCHDOG_MS (15s) armed uniformly for them too, which could
   * false-positive on a merely slow (not stuck) HTML/generative artwork, the
   * docs' own "dominant artwork type". These now get a materially longer
   * window (ARTWORK_LOAD_WATCHDOG_EMBEDDED_MS, 45s) before being treated as
   * a failure, while still eventually catching a genuinely stuck one. jsdom
   * never fires an iframe's `load` event on its own, so an iframe artwork
   * that is simply rendered and left alone IS this test's "stuck" case.
   */
  it('does not fail an iframe artwork at the old 15s bound, but does at the new 45s one', async () => {
    vi.useFakeTimers();
    const onArtworkExhausted = vi.fn();
    render(iframePlayerNode(onArtworkExhausted));
    await advanceTimersBy(0);

    // Past the base image/video/audio bound — an iframe/model load must not
    // false-positive here.
    await advanceTimersBy(20000);
    expect(canvasService.getStatus().renderStatus).not.toBe(RenderStatus.failed);
    expect(onArtworkExhausted).not.toHaveBeenCalled();

    // Past the new, longer bound — a genuinely stuck iframe is still caught.
    await advanceTimersBy(25000);
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
  });
});

describe('ArtworkPlayer — a scheduled retry bails while WebGL context is lost', () => {
  /**
   * Regression for run-reviewer bot-round-2 pass-2 F2: the scheduled
   * artwork-failure retry timer had no WebGL-awareness of its own, unlike
   * the watchdog's arm-time check — a failure unrelated to WebGL could have
   * its already-scheduled retry land while a context loss is independently
   * in progress, reloading into a GPU that is not back yet. The retry
   * callback must bail instead, leaving `startWebGLRecovery`'s own
   * `reloadIframe` to revive the slot once GL returns.
   */
  it('skips the scheduled reload when WebGL context is lost at retry time', async () => {
    // Capture the 'webglcontextlost' listener the component registers on its
    // (detached, lazily-created) canvas — mirrors the pattern already proven
    // in ArtworkPlayer.renderStatus.test.tsx's "WebGL recovery" describe
    // block, since the canvas is never attached to the document and so
    // cannot be found via querySelector.
    let lostListener: ((event: Event) => void) | undefined;
    const originalAddEventListener =
      // eslint-disable-next-line @typescript-eslint/unbound-method -- prototype method saved before spy
      HTMLCanvasElement.prototype.addEventListener;
    vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener').mockImplementation(
      function (
        this: HTMLCanvasElement,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions
      ) {
        if (type === 'webglcontextlost' && typeof listener === 'function') {
          lostListener = listener;
        }
        originalAddEventListener.call(this, type, listener, options);
      }
    );

    vi.useFakeTimers();
    const onArtworkExhausted = vi.fn();
    render(playerNode(onArtworkExhausted));

    // Initial attempt fails, scheduling a retry 3s out.
    await advanceTimersBy(0);
    expect(loaderState.loadCalls).toBe(1);
    expect(lostListener).toBeTypeOf('function');

    // An unrelated WebGL context loss happens before the retry fires.
    await act(async () => {
      lostListener?.(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });

    // The scheduled retry must bail rather than reload into the lost context.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(1);
    expect(onArtworkExhausted).not.toHaveBeenCalled();
  });
});
