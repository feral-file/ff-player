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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentTypeDetectionError } from '@/utils/helper';
import ArtworkPlayer from './ArtworkPlayer';

const contentTypeMock = vi.hoisted(() => vi.fn<() => Promise<string>>());

const probeGetMock = vi.hoisted(() =>
  vi.fn<(url: string) => Promise<'answered' | 'silent' | 'rejected'>>()
);

vi.mock('@/utils/helper', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/helper')>()),
  getContentTypeFromURL: contentTypeMock,
}));
// The plain-GET confirmation a HEAD with no response gets (sourceProbe.ts).
// It answers by default: a reachable page whose HEAD was refused or
// CORS-blocked.
vi.mock('@/utils/sourceProbe', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/sourceProbe')>()),
  probeGet: probeGetMock,
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

/** A HEAD that got no response while online: DNS, refused, timeout or a CORS block. */
function noResponseError(): ContentTypeDetectionError {
  return new ContentTypeDetectionError(
    'Failed to determine content type: TypeError: Failed to fetch',
    false
  );
}

/** A reached-but-unhelpful HTTP response (e.g. a 405) — the server answered this attempt. */
function reachedServerUnhelpfulError(): ContentTypeDetectionError {
  return new ContentTypeDetectionError(
    'Failed to determine content type: Error: HEAD request failed with status 405 Method Not Allowed',
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

beforeEach(() => {
  probeGetMock.mockResolvedValue('answered');
});

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
        false,
        true
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

describe('ArtworkPlayer — a source whose GET gets no answer at all is declared failed (ff-player#311)', () => {
  it('shows the "cannot be displayed" message and renders no iframe, without raising degraded', async () => {
    // A black-holed host on an online device: neither the HEAD nor the GET
    // gets anything back. Pointing an iframe at it would show Chromium's own
    // error page and report it ready for the whole item.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(noResponseError());
    probeGetMock.mockResolvedValue('silent');

    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(setPlaybackDegraded));

    await waitForCannotBeDisplayed();
    expect(probeGetMock).toHaveBeenCalledWith(EXTENSIONLESS);
    expect(container.querySelector('iframe')).toBeNull();
    // Not the device-wide offline backdrop: this device is online, only the
    // one source is dead.
    expect(setPlaybackDegraded).not.toHaveBeenCalled();
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
  });

  it('commits the failed incoming slot through the transition owner instead of leaving it wedged', async () => {
    // feral-file#3583 review F1: the failure must settle the slot through
    // `transition.fail()`, so the failed slot still commits, the settings
    // latch is released, and later work can proceed.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(noResponseError());
    probeGetMock.mockResolvedValue('silent');

    const onItemCommitted = vi.fn();
    render(playerNode(vi.fn(), undefined, onItemCommitted));

    await waitForCannotBeDisplayed();
    await waitFor(() => {
      expect(onItemCommitted).toHaveBeenCalledWith(EXTENSIONLESS);
    });
  });
});

describe('ArtworkPlayer — a HEAD never fails a work on its own (ff-player#311)', () => {
  it('mounts the fallback iframe when the HEAD got no response but a GET is answered', async () => {
    // A host that refuses HEAD, or omits CORS headers on it, rejects the
    // probe exactly like a dead host; the page itself is served.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(noResponseError());

    const { container } = render(playerNode(vi.fn()));

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
    expect(probeGetMock).toHaveBeenCalledWith(EXTENSIONLESS);
  });

  it('mounts the fallback iframe when the GET is rejected early on an ordinary host', async () => {
    // Review F1: `Cross-Origin-Resource-Policy: same-origin` rejects the
    // no-cors fetch exactly like DNS or a refused connection, yet the
    // iframe's navigation is not subject to it and shows the page.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(noResponseError());
    probeGetMock.mockResolvedValue('rejected');

    const { container } = render(playerNode(vi.fn()));

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
  });

  it('asks no GET when the HEAD reached the server, even unhelpfully', async () => {
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(reachedServerUnhelpfulError());

    const { container } = render(playerNode(vi.fn()));

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
    expect(probeGetMock).not.toHaveBeenCalled();
  });

  it('judges every attempt afresh: a source that failed mounts once it answers', async () => {
    // No per-URL memory: a host that was silent on one attempt (an onchfs
    // work still being read from chain) plays on the next one that answers.
    stubWebGL();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(noResponseError());
    probeGetMock.mockResolvedValueOnce('silent');

    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(vi.fn(), cb => {
        reload = cb;
      })
    );
    await waitForCannotBeDisplayed();
    expect(container.querySelector('iframe')).toBeNull();

    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
  });
});

describe('ArtworkPlayer — a GET that fails while the device goes offline takes the offline path (PR #337 review F2)', () => {
  it('takes the offline path when the device went offline while the GET ran', async () => {
    // Review F2: the failure is the device's, not the source's, so it must
    // raise degraded instead of spending the work's retry budget.
    stubWebGL();
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(noResponseError());
    probeGetMock.mockImplementation(() => {
      onLine.mockReturnValue(false);
      return Promise.resolve('silent');
    });

    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(setPlaybackDegraded));

    await waitFor(() => {
      expect(setPlaybackDegraded).toHaveBeenCalledWith(true, EXTENSIONLESS);
    });
    expect(screen.queryByText(CANNOT_BE_DISPLAYED_TEXT)).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('takes the offline path when the link dropped and the GET was rejected at once', async () => {
    // A dropped link rejects the GET fast (ERR_INTERNET_DISCONNECTED), not
    // silently: the offline path must still take it, not the iframe.
    stubWebGL();
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    contentTypeMock.mockRejectedValue(noResponseError());
    probeGetMock.mockImplementation(() => {
      onLine.mockReturnValue(false);
      return Promise.resolve('rejected');
    });

    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(setPlaybackDegraded));

    await waitFor(() => {
      expect(setPlaybackDegraded).toHaveBeenCalledWith(true, EXTENSIONLESS);
    });
    expect(screen.queryByText(CANNOT_BE_DISPLAYED_TEXT)).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });
});
