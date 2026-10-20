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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

vi.mock('@google/model-viewer', () => {
  if (!customElements.get('model-viewer')) {
    customElements.define('model-viewer', class extends HTMLElement {});
  }
  return {};
});

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

function playerNode(
  onArtworkExhausted: (itemIdentity: string) => void,
  onItemPlayed?: (itemIdentity: string) => void,
  previewURL: string = PREVIEW_URL,
  itemIdentity: string = ITEM_IDENTITY
) {
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
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={itemIdentity}
        onArtworkExhausted={onArtworkExhausted}
        onItemPlayed={onItemPlayed}
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

const PDF_PREVIEW_URL = 'https://feralfile.com/test/stuck-document.pdf';

function pdfPlayerNode(onArtworkExhausted: (itemIdentity: string) => void) {
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
        previewURL={PDF_PREVIEW_URL}
        artworkPreviewMIMEType="application/pdf"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={ITEM_IDENTITY}
        onArtworkExhausted={onArtworkExhausted}
      />
    </AppContext.Provider>
  );
}

const MODEL_PREVIEW_URL = 'https://feralfile.com/test/stuck-model.glb';

function modelPlayerNode(onArtworkExhausted: (itemIdentity: string) => void) {
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
        previewURL={MODEL_PREVIEW_URL}
        artworkPreviewMIMEType="model/gltf-binary"
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

// Captures the 'webglcontextlost' listener the component registers on its
// (detached, lazily-created) canvas — the canvas is never attached to the
// document, so it cannot be found via querySelector; this mirrors the
// pattern already proven in ArtworkPlayer.renderStatus.test.tsx's "WebGL
// recovery" describe block.
function captureWebglContextLostListener(): {
  get: () => ((event: Event) => void) | undefined;
} {
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
  return { get: () => lostListener };
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
    const onItemPlayed = vi.fn();
    render(playerNode(onArtworkExhausted, onItemPlayed));
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

    // feralfile-bot review of PR #310, round 3: the original failure commit
    // never calls onItemPlayed (gated on renderStatus !== failed), and this
    // recovery bypasses the only other call site (the
    // pendingReadySlotRef-driven transition-commit effect) — so without a
    // call here, PlaylistClient's recently-played history would never learn
    // this work actually played.
    expect(onItemPlayed).toHaveBeenCalledTimes(1);
    expect(onItemPlayed).toHaveBeenCalledWith(ITEM_IDENTITY);

    // The scheduled retry must have been cancelled by the late success —
    // no second, gratuitous reload of content that already loaded fine.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(1);
    expect(onArtworkExhausted).not.toHaveBeenCalled();

    // A stray second success signal for the same, already-recovered mount
    // (e.g. a late loadeddata) must not double-record it.
    await act(async () => {
      loaderState.lastOnLoad?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onItemPlayed).toHaveBeenCalledTimes(1);
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

  /**
   * Regression for run-reviewer bot-round-2 pass-5 F1: PreviewHTMLTag.iframePDF
   * gets the same longer watchdog window via a check at the watchdog's own
   * call site, kept deliberately separate from isEmbeddedHeavy (folding it
   * in there once already caused a silent transition-style regression —
   * pass-4 F1). Nothing in the suite exercised this specific branch, so a
   * regression that re-folds iframePDF into isEmbeddedHeavy, or drops the
   * carve-out entirely, would ship green without this test.
   */
  it('does not fail a PDF artwork at the old 15s bound, but does at the new 45s one', async () => {
    vi.useFakeTimers();
    const onArtworkExhausted = vi.fn();
    render(pdfPlayerNode(onArtworkExhausted));
    await advanceTimersBy(0);

    await advanceTimersBy(20000);
    expect(canvasService.getStatus().renderStatus).not.toBe(RenderStatus.failed);
    expect(onArtworkExhausted).not.toHaveBeenCalled();

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
    const webglLost = captureWebglContextLostListener();

    vi.useFakeTimers();
    const onArtworkExhausted = vi.fn();
    render(playerNode(onArtworkExhausted));

    // Initial attempt fails, scheduling a retry 3s out.
    await advanceTimersBy(0);
    expect(loaderState.loadCalls).toBe(1);
    expect(webglLost.get()).toBeTypeOf('function');

    // An unrelated WebGL context loss happens before the retry fires.
    await act(async () => {
      webglLost.get()?.(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });

    // The scheduled retry must bail rather than reload into the lost context.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(1);
    expect(onArtworkExhausted).not.toHaveBeenCalled();
  });

  /**
   * Regression for run-reviewer bot-round-3 pass-1 F1: when WebGL recovery
   * gives up after MAX_RECOVERY_TIME (10 min) rather than succeeding, the
   * give-up branch never reset `isWebGLContextLost` — only the success
   * branch did. Since this flag is now read by BOTH the stuck-load watchdog
   * and the scheduled retry timer (added this round), a stuck-true flag
   * after a failed recovery would permanently disable both mechanisms for
   * every later, unrelated playlist item — reopening #307's own "device
   * stays controllable" requirement through a new trigger. This mounts a
   * second, unrelated item AFTER give-up and confirms its own watchdog
   * still fires normally, instead of silently bailing on a stale flag.
   */
  it('restores the watchdog/retry budget for a later item once WebGL recovery gives up', async () => {
    const webglLost = captureWebglContextLostListener();

    vi.useFakeTimers();
    loaderState.mode = 'hang';
    const onArtworkExhausted = vi.fn();
    const { rerender } = render(playerNode(onArtworkExhausted));
    await advanceTimersBy(0);
    expect(loaderState.loadCalls).toBe(1);

    await act(async () => {
      webglLost.get()?.(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });

    // Recovery polls every 5s and never succeeds in jsdom (no real WebGL) —
    // advance past MAX_RECOVERY_TIME (10 min) so it gives up.
    await advanceTimersBy(605000);
    expect(
      screen.getByText('Couldn’t restore this artwork. Try another work.')
    ).toBeTruthy();

    // A later, unrelated item mounts — same as the playlist advancing. Reuse
    // the same onArtworkExhausted identity (a stable useCallback in
    // production, from PlaylistClient) so this rerender only changes the
    // item, not the callback — a fresh callback here would itself cascade
    // into setupMediaForSlot's own deps and re-trigger slot 0's load too,
    // which is not what this test is isolating.
    rerender(
      playerNode(
        onArtworkExhausted,
        undefined,
        'https://feralfile.com/test/next-item.jpg',
        'tezos:mainnet:fa2:KT1next:1'
      )
    );
    await advanceTimersBy(0);
    expect(loaderState.loadCalls).toBe(2);

    // Its own watchdog must fire normally, not bail on the stale flag.
    await advanceTimersBy(15000);
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
  });

  /**
   * Regression for run-reviewer bot-round-3 pass-2 F1: resetting
   * isWebGLContextLost on give-up only helps LATER items — the specific
   * item whose own scheduled retry bailed on that exact flag was otherwise
   * left stranded in RenderStatus.failed forever, since nothing else
   * re-drives it (reloadIframe only runs on the success branch). Give-up
   * must resume THAT item's own bounded budget too.
   */
  it('resumes the specific item whose retry bailed, once WebGL recovery gives up', async () => {
    const webglLost = captureWebglContextLostListener();

    vi.useFakeTimers();
    loaderState.mode = 'fail';
    const onArtworkExhausted = vi.fn();
    render(playerNode(onArtworkExhausted));

    // Real failure: schedules its own retry 3s out.
    await advanceTimersBy(0);
    expect(loaderState.loadCalls).toBe(1);
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);

    // WebGL is lost before that retry fires.
    await act(async () => {
      webglLost.get()?.(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });

    // The scheduled retry bails on the lost context — no reload yet.
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(1);

    // Recovery never succeeds in jsdom; advance past MAX_RECOVERY_TIME so it
    // gives up (605000 total; 3000 of it already elapsed above).
    await advanceTimersBy(602000);
    expect(
      screen.getByText('Couldn’t restore this artwork. Try another work.')
    ).toBeTruthy();

    // Give-up must have resumed this exact item's own budget — a fresh
    // retry, paced the normal 3s, not a silent, permanent stall.
    expect(onArtworkExhausted).not.toHaveBeenCalled();
    await advanceTimersBy(3000);
    expect(loaderState.loadCalls).toBe(2);
  });
});

describe('ArtworkPlayer — model-viewer failures feed the same retry-then-skip budget', () => {
  /**
   * Regression for run-reviewer bot-round-3 pass-2 F2: handleModelLoadError
   * has carried its own scheduleArtworkFailureRetryOrSkip() call since this
   * branch's very first round, but nothing exercised a model-viewer failure
   * through to the retry/skip budget — unlike every other content type,
   * which ArtworkPlayer.model.test.tsx's own error-handling tests never
   * drive past the FIRST failure either (no fake timers there). Proves the
   * same 3-attempt, 3s-apart, then-onArtworkExhausted shape already proven
   * for image/iframe/PDF/HLS applies here too.
   */
  it('retries a model-viewer load error in place, then hands off to onArtworkExhausted', async () => {
    const onArtworkExhausted = vi.fn();
    const { container } = render(modelPlayerNode(onArtworkExhausted));

    const firstModelViewerEl = await waitFor(() => {
      const node = container.querySelector('model-viewer');
      if (!node) {
        throw new Error('model-viewer element was not rendered');
      }
      return node;
    });

    vi.useFakeTimers();

    // First failure.
    act(() => {
      firstModelViewerEl.dispatchEvent(new Event('error'));
    });
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
    expect(onArtworkExhausted).not.toHaveBeenCalled();

    // Retry 1 (3s later): performArtworkReload remounts into the OTHER
    // slot — a fresh <model-viewer> element, per this branch's own reload
    // contract. advanceTimersBy already flushes React's state updates
    // inside act(), so the fresh element is queried synchronously right
    // after — waitFor's own polling uses real setTimeout and would hang
    // forever once fake timers are active, since nothing ever advances it.
    await advanceTimersBy(3000);
    const secondNodes = container.querySelectorAll('model-viewer');
    const secondModelViewerEl = Array.from(secondNodes).find(
      n => n !== firstModelViewerEl
    );
    if (!secondModelViewerEl) {
      throw new Error('retried model-viewer element was not rendered');
    }
    act(() => {
      secondModelViewerEl.dispatchEvent(new Event('error'));
    });
    expect(onArtworkExhausted).not.toHaveBeenCalled();

    // Retry 2 is the 3rd attempt overall — the limit. Must hand off instead
    // of retrying again.
    await advanceTimersBy(3000);
    const thirdNodes = container.querySelectorAll('model-viewer');
    const thirdModelViewerEl = Array.from(thirdNodes).find(
      n => n !== firstModelViewerEl && n !== secondModelViewerEl
    );
    if (!thirdModelViewerEl) {
      throw new Error('second retried model-viewer element was not rendered');
    }
    act(() => {
      thirdModelViewerEl.dispatchEvent(new Event('error'));
    });
    expect(onArtworkExhausted).toHaveBeenCalledTimes(1);
    expect(onArtworkExhausted).toHaveBeenCalledWith(ITEM_IDENTITY);
  });
});
