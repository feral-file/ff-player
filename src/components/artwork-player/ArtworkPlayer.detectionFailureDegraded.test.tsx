/**
 * Detection failure is a first-class outcome, not just a typing guess.
 *
 * `getContentTypeFromURL`'s HEAD dies for two very different reasons: a
 * genuine NETWORK failure (offline, DNS, connection refused — `fetch` never
 * got a response), or a reached-but-unhelpful response (4xx/5xx, or 2xx with
 * no `Content-Type` header — the server IS reachable, the type just isn't).
 * Both land on the same fallback iframe (`mimeType: null`), but only the
 * network case is evidence the artwork is currently unreachable. On a cold
 * offline boot with an extensionless source, there is no PRIOR degraded
 * flag for the fallback-iframe's own `load` handler to protect (see
 * ArtworkPlayer.fallbackIframe.test.tsx) — without raising the flag at the
 * detection-catch site itself, this source shape got no offline backdrop
 * and no reconnect recovery at all.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentTypeDetectionError } from '@/utils/helper';
import ArtworkPlayer from './ArtworkPlayer';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

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
  onRegisterArtworkReload?: (reload: (() => void) | null) => void
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ArtworkPlayer — network-classified detection failure raises degraded', () => {
  it('raises the degraded flag on a cold offline boot (HEAD never got a response)', async () => {
    stubWebGL();
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
    // The fallback iframe still mounts — something renders even though the
    // flag is now up.
    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });
  });

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
    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });

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
