/**
 * The fallback-typed iframe must not report a load outcome.
 *
 * When type detection itself fails (offline, `getContentTypeFromURL`'s HEAD
 * dies), the slot pins to an iframe as a guess (`mimeType: null`). A
 * cross-origin iframe fires `load` even for Chromium's own network-error
 * page, so scoring that `load` as a success would CLEAR a degraded flag the
 * artwork's real preview type raised — dropping the offline backdrop and
 * standing down the reconnect recovery on exactly the offline boot it exists
 * for. Only a confidently-typed iframe (detection resolved a MIME type) may
 * report.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
// probe, which is the seam under test.
const EXTENSIONLESS = 'https://feralfile.com/test/generative-piece';

function playerNode(
  setPlaybackDegraded: (degraded: boolean) => void,
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ArtworkPlayer — fallback-typed iframe reports no outcome', () => {
  it('does not clear a raised degraded flag when the recovery remount falls back to an iframe', async () => {
    // The iframe branch is gated on WebGL availability, absent in jsdom:
    // stub a truthy context AND the WebGL*RenderingContext globals its
    // logging `instanceof` checks dereference.
    vi.stubGlobal('WebGLRenderingContext', vi.fn());
    vi.stubGlobal('WebGL2RenderingContext', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as never
    );

    // First mount: HEAD succeeds, the artwork is a real image…
    contentTypeMock.mockResolvedValueOnce('image/jpeg');
    // …every later probe (the recovery remount, still offline) dies.
    contentTypeMock.mockRejectedValue(new Error('Network Error'));

    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(setPlaybackDegraded, cb => {
        reload = cb;
      })
    );

    // The image fails offline: the real preview type raises the flag.
    const img = await waitFor(() => {
      const el = container.querySelector('img');
      if (!el?.src) {
        throw new Error('image slot has not been given a source yet');
      }
      return el;
    });
    await fireMedia(img, 'error');
    expect(setPlaybackDegraded).toHaveBeenCalledTimes(1);
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true, EXTENSIONLESS);

    // Reconnect recovery re-mounts the same item; detection now fails and
    // the slot pins to the fallback iframe.
    await act(async () => {
      reload?.();
      await Promise.resolve();
    });
    const iframe = await waitFor(() => {
      const el = container.querySelector('iframe');
      if (!el) {
        throw new Error('fallback iframe has not mounted yet');
      }
      return el;
    });

    // Chromium fires `load` for its own error page. The guessed type must
    // not score that as success — the flag stays up, the backdrop stays on,
    // and the next online edge retries.
    await fireMedia(iframe, 'load');
    expect(setPlaybackDegraded).toHaveBeenCalledTimes(1);
  });
});
