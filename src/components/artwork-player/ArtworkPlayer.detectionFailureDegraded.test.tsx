/**
 * Detection failure is a first-class outcome, not just a typing guess.
 *
 * `getContentTypeFromURL`'s HEAD dies for several different reasons: a
 * genuine NETWORK failure (offline, DNS, connection refused — `fetch` never
 * got a response), a reached-but-unhelpful response (4xx/5xx, or 2xx with no
 * `Content-Type` header — the server IS reachable, the type just isn't), or
 * a CORS/CSP/extension block (a `fetch` rejection indistinguishable from a
 * network failure by itself, but `navigator.onLine` corroborates it is
 * NOT one — see helper.test.ts's own classification suite for that guard).
 * Only the corroborated network case is evidence the artwork is currently
 * unreachable, and the two classes now diverge in what they render, too. The
 * reached-but-unclassified cases land on the fallback iframe (`mimeType:
 * null` — a render attempt can genuinely succeed against a reachable
 * server). The corroborated-offline case commits NOTHING: an iframe pointed
 * at a provably unreachable source can only render Chromium's in-frame
 * net-error page, which the reconnect handover would put on the wall for the
 * seconds the recovery remount needs (the field "dinosaur" flash). The slot
 * stays pending, the degraded flag raised at the detection-catch site drives
 * the offline backdrop and the reconnect recovery, and the recovery remount
 * re-runs detection on the same URL.
 */
import { AppContext } from '@/context/AppContext';
import { RenderStatus } from '@/models';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentTypeDetectionError } from '@/utils/helper';
import ArtworkPlayer from './ArtworkPlayer';

const contentTypeMock = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock('@/utils/helper', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/helper')>()),
  getContentTypeFromURL: contentTypeMock,
}));

// Extensionless trusted-origin URL: preview typing must go through the HEAD
// probe (`getContentTypeFromURL`, mocked above), which is the seam under test.
const EXTENSIONLESS = 'https://feralfile.com/test/generative-piece';

function playerNode(
  setPlaybackDegraded: (degraded: boolean, url?: string) => void,
  onRegisterArtworkReload?: (reload: (() => void) | null) => void,
  onItemCommitted?: (identity: string) => void
): React.ReactElement {
  return (
    <AppContext.Provider
      value={
        {
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
        } as never
      }>
      <ArtworkPlayer
        previewURL={EXTENSIONLESS}
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={EXTENSIONLESS}
        onRegisterArtworkReload={onRegisterArtworkReload}
        onItemCommitted={onItemCommitted}
      />
    </AppContext.Provider>
  );
}

async function fireMedia(el: HTMLElement, type: 'load' | 'error') {
  await act(async () => {
    el.dispatchEvent(new Event(type));
    await Promise.resolve();
  });
}

/** Stubs the WebGL globals the fallback-iframe branch's logging checks dereference. */
function stubWebGL() {
  vi.stubGlobal('WebGLRenderingContext', vi.fn());
  vi.stubGlobal('WebGL2RenderingContext', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as never
  );
}

/** The probe's own AbortController firing — feral-file#3583's genuine-timeout shape. */
function timedOutAbortError(): ContentTypeDetectionError {
  return new ContentTypeDetectionError(
    'Failed to determine content type: AbortError: signal is aborted without reason',
    false,
    true
  );
}

/** A fast native rejection — the CORS-block shape, and what a dead host degrades to later. */
function fastRejectionError(): ContentTypeDetectionError {
  return new ContentTypeDetectionError(
    'Failed to determine content type: TypeError: Failed to fetch',
    false,
    false
  );
}

/** Both independent flags true at once — a transient offline blip during a genuine timeout. */
function timedOutAndNetworkFailureError(): ContentTypeDetectionError {
  return new ContentTypeDetectionError(
    'Failed to determine content type: AbortError: signal is aborted without reason',
    true,
    true
  );
}

/** A reached-but-unhelpful HTTP response (e.g. a 405) — the server answered this attempt. */
function reachedServerUnhelpfulError(): ContentTypeDetectionError {
  return new ContentTypeDetectionError(
    'Failed to determine content type: Error: HEAD request failed with status 405 Method Not Allowed',
    false,
    false,
    true
  );
}

const CANNOT_BE_DISPLAYED_TEXT =
  'The artwork cannot be displayed correctly on this device.';

async function waitForCannotBeDisplayed() {
  await waitFor(() => {
    expect(screen.queryByText(CANNOT_BE_DISPLAYED_TEXT)).toBeTruthy();
  });
}

afterEach(() => {
  cleanup();
  canvasService.setCastInfo(null, false);
  canvasService.setRenderStatus(undefined);
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ArtworkPlayer — network-classified detection failure raises degraded', () => {
  it('raises the degraded flag on a cold offline boot (HEAD never got a response, navigator.onLine corroborates)', async () => {
    stubWebGL();
    // getContentTypeFromURL is mocked in this file (see above), so this
    // stub does not drive the classification itself — that guard is pinned
    // directly against the real function in helper.test.ts. It documents
    // the precondition this scenario actually has on-device: a cold offline
    // boot always has `navigator.onLine === false`, which is exactly what
    // makes `isNetworkFailure: true` a safe classification for
    // ArtworkPlayer to act on here.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    contentTypeMock.mockRejectedValue(
      new ContentTypeDetectionError(
        'Failed to determine content type: TypeError: Failed to fetch',
        true
      )
    );

    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(setPlaybackDegraded));

    await waitFor(() => {
      expect(setPlaybackDegraded).toHaveBeenCalledWith(true, EXTENSIONLESS);
    });
    // No fallback iframe: offline is corroborated, so a remote iframe could
    // only render Chromium's own net-error page — the "dinosaur" that
    // becomes visible the moment the offline backdrop lifts on reconnect.
    // The slot stays pending (renders nothing) until the recovery remount
    // re-runs detection. The degraded call above proves the catch already
    // ran, so this is a real assertion, not a not-yet race.
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('ArtworkPlayer — reachable-server detection failure does not raise degraded', () => {
  it('does not raise the degraded flag on a reachable-but-unhelpful response (HTTP 404/500)', async () => {
    stubWebGL();
    contentTypeMock.mockRejectedValue(
      new ContentTypeDetectionError(
        'Failed to determine content type: Error: HEAD request failed with status 404 Not Found',
        false
      )
    );

    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(setPlaybackDegraded));

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
    // A healthy-but-extensionless artwork must not be marked degraded just
    // because its type could not be determined — the server WAS reachable.
    expect(setPlaybackDegraded).not.toHaveBeenCalled();
  });

  it('does not raise the degraded flag on a CORS-blocked HEAD while the device is online', async () => {
    // The corroboration guard itself (a fetch rejection alone cannot tell
    // offline from CORS; navigator.onLine must confirm it) is pinned
    // directly against the real getContentTypeFromURL in
    // helper.test.ts — "does NOT classify a fetch rejection as a network
    // failure when navigator.onLine is true". This test is the consumer
    // side: ArtworkPlayer must respect an `isNetworkFailure: false`
    // classification (what the real guard produces for exactly this
    // scenario) and never raise degraded for it, even though the underlying
    // `fetch` rejected the same way a real network failure would.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(
      new ContentTypeDetectionError(
        'Failed to determine content type: TypeError: Failed to fetch',
        false
      )
    );

    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(setPlaybackDegraded));

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
    expect(setPlaybackDegraded).not.toHaveBeenCalled();
  });
});

describe('ArtworkPlayer — network-classified detection failure recovery loop', () => {
  it('closes the recovery loop: a successful remount after a network detection failure clears the flag', async () => {
    stubWebGL();
    // First mount: offline, detection fails at the network level.
    contentTypeMock.mockRejectedValueOnce(
      new ContentTypeDetectionError(
        'Failed to determine content type: TypeError: Failed to fetch',
        true
      )
    );
    // Reconnect-recovery remount: the network is back, HEAD resolves a real type.
    contentTypeMock.mockResolvedValueOnce('image/jpeg');

    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(setPlaybackDegraded, cb => {
        reload = cb;
      })
    );

    await waitFor(() => {
      expect(setPlaybackDegraded).toHaveBeenCalledWith(true, EXTENSIONLESS);
    });
    // The offline mount committed nothing (see the cold-boot test above).
    expect(container.querySelector('iframe')).toBeNull();

    // Reconnect recovery re-mounts the same item; detection now resolves.
    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    const img = await waitFor(() => {
      const el = container.querySelector('img');
      if (!el?.src) {
        throw new Error('image slot has not been given a source yet');
      }
      return el;
    });

    await fireMedia(img, 'load');

    expect(setPlaybackDegraded).toHaveBeenCalledTimes(2);
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(false, EXTENSIONLESS);
  });
});

describe('ArtworkPlayer — network-classified detection failure render status', () => {
  it('reports failed instead of pinning loading when detection fails offline', async () => {
    vi.useFakeTimers();
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    contentTypeMock.mockRejectedValue(
      new ContentTypeDetectionError(
        'Failed to determine content type: TypeError: Failed to fetch',
        true
      )
    );

    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    render(
      playerNode(setPlaybackDegraded, cb => {
        reload = cb;
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);

    // The 2s delay must not resurrect `loading`: nothing is rendering for this
    // mount, so a `loading` here would report an in-flight attempt that does
    // not exist — indefinitely, once the recovery budget is spent.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);

    // The recovery remount owns the reset back to pending.
    contentTypeMock.mockResolvedValueOnce('image/jpeg');
    await act(async () => {
      reload?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
  });
});

describe('ArtworkPlayer — unresponsive-source detection failure declares failed (feral-file#3583)', () => {
  it('shows the "cannot be displayed" message and renders no iframe for a timed-out, online-device probe', async () => {
    // feral-file#3583: a dead IPFS gateway accepts the connection but never
    // answers. The device is online (isNetworkFailure: false, the degraded/
    // offline backdrop is the wrong signal here), but this one source is
    // proven unreachable (timedOut: true) — pointing an iframe at it would
    // just render Chromium's own in-frame net-error page with nothing ever
    // telling the viewer playback failed.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(timedOutAbortError());

    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(setPlaybackDegraded));

    await waitForCannotBeDisplayed();
    expect(container.querySelector('iframe')).toBeNull();
    // Not the device-wide offline backdrop: this device is online, only the
    // one source is dead.
    expect(setPlaybackDegraded).not.toHaveBeenCalled();
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
  });
});

describe('ArtworkPlayer — unresponsive-source detection failure settles the transition (run-reviewer F1)', () => {
  it('commits the failed incoming slot through the transition owner instead of leaving it wedged', async () => {
    // Before this fix, the confirmedUnreachable branch called only
    // recovery.fail() and never touched `transition`: the incoming slot
    // stayed at `loading: true` forever, `commitReadySlot` never saw it
    // ready, and `onItemCommitted` never fired for the failed item — the
    // settings latch stayed pinned to whatever was previously on screen
    // (surfaced live as `DisplaySettingsService`'s "The showing changed or
    // is still loading." on an advertised showingKey that could never
    // settle). `transition.fail()` must be what declares it, so the failed
    // slot still commits and later work can proceed.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(timedOutAbortError());

    const setPlaybackDegraded = vi.fn();
    const onItemCommitted = vi.fn();
    render(playerNode(setPlaybackDegraded, undefined, onItemCommitted));

    await waitForCannotBeDisplayed();
    await waitFor(() => {
      expect(onItemCommitted).toHaveBeenCalledWith(EXTENSIONLESS);
    });
  });
});

describe('ArtworkPlayer — unresponsive-source memory survives a later fast rejection (feral-file#3583, live FF1 finding)', () => {
  // Live-verified on an FF1: after enough consecutive timeouts against the
  // same dead host, Chromium stops waiting out the probe's own
  // AbortController and starts rejecting `fetch` natively and fast instead —
  // a bare TypeError, shape-identical to a CORS block, with `timedOut:
  // false`. Without memory of the earlier genuine timeout, this later
  // attempt would fall through to the iframe branch and reproduce the exact
  // bug this file fixes, on the very source already proven dead.
  it('keeps declaring the same URL failed once timed out, even after a later retry fails fast instead', async () => {
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValueOnce(timedOutAbortError());

    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(setPlaybackDegraded, cb => {
        reload = cb;
      })
    );
    await waitForCannotBeDisplayed();

    contentTypeMock.mockRejectedValueOnce(fastRejectionError());
    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    await waitForCannotBeDisplayed();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('remembers a timeout even when it coincides with a corroborated offline blip, for a later fast-failing retry once back online', async () => {
    // run-reviewer round 2, F1: isNetworkFailure and timedOut are
    // independent flags and can both be true on the same attempt (a
    // connectivity drop exactly while the probe's own AbortController was
    // mid-wait). Recording timedOut only in the isNetworkFailure-false
    // branch would drop that attempt's unreachability evidence, so a later
    // attempt — once back online, failing fast instead — would wrongly fall
    // through to the iframe branch.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    contentTypeMock.mockRejectedValueOnce(timedOutAndNetworkFailureError());

    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(setPlaybackDegraded, cb => {
        reload = cb;
      })
    );
    await waitFor(() => {
      expect(setPlaybackDegraded).toHaveBeenCalledWith(true, EXTENSIONLESS);
    });

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValueOnce(fastRejectionError());
    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    await waitForCannotBeDisplayed();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('forgets a URL once it genuinely resolves, so a recovered source is not stuck declared-failed', async () => {
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValueOnce(timedOutAbortError());

    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(setPlaybackDegraded, cb => {
        reload = cb;
      })
    );
    await waitForCannotBeDisplayed();

    contentTypeMock.mockResolvedValueOnce('image/jpeg');
    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    const img = await waitFor(() => {
      const el = container.querySelector('img');
      if (!el?.src) {
        throw new Error('image slot has not been given a source yet');
      }
      return el;
    });
    await fireMedia(img, 'load');

    // A later re-failure of the same now-recovered URL is judged fresh, not
    // short-circuited by stale memory of the earlier timeout.
    contentTypeMock.mockRejectedValueOnce(fastRejectionError());
    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
  });
});

describe('ArtworkPlayer — unresponsive-source memory clears on a reached response (feral-file#3583 review F2)', () => {
  it('forgets a timeout once a later retry reaches the server, even with an unhelpful response', async () => {
    // The live finding this guards: a gateway that timed out once can start
    // answering on a later attempt, just not usefully (e.g. a 405). That
    // attempt reached the server — the reached-but-unhelpful-HTTP
    // classification must stay unchanged (iframe fallback), not get
    // overridden by the earlier timeout's stale memory.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValueOnce(timedOutAbortError());

    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(setPlaybackDegraded, cb => {
        reload = cb;
      })
    );
    await waitForCannotBeDisplayed();

    contentTypeMock.mockRejectedValueOnce(reachedServerUnhelpfulError());
    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
  });
});
