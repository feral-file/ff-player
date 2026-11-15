/**
 * A source whose Content-Type probe failed is shown as an image when it is
 * one.
 *
 * The probe is a cross-origin `HEAD`. A public IPFS gateway can fail it
 * (rate limit, 5xx, missing CORS headers) for a file it then serves fine, and
 * an extensionless CID URL has nothing else to type it by. The slot used to
 * pin to the untyped iframe, where an image draws at its natural size in the
 * corner instead of at the display's scaling (FF1, 2026-11-15: an 800 px GIF
 * at a third of a 4K panel's height). The player now asks the browser whether
 * the source decodes as an image before guessing "web page".
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const contentTypeMock = vi.hoisted(() => vi.fn<() => Promise<string>>());
const loadsAsImageMock = vi.hoisted(() =>
  vi.fn<(url: string) => Promise<boolean>>()
);

vi.mock('@/utils/helper', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/helper')>()),
  getContentTypeFromURL: contentTypeMock,
}));
vi.mock('@/utils/imageProbe', () => ({ loadsAsImage: loadsAsImageMock }));

// A bare IPFS CID on a gateway: no extension to infer a type from.
const CID_URL =
  'https://ipfs.example.com/ipfs/QmUcmcXTrGuz6S7JDrKBJtvzZFJVBKSk125FPetwWMyqeU';

function playerNode(): React.ReactElement {
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
            setPlaybackDegraded: vi.fn(),
          },
        } as never
      }>
      <ArtworkPlayer
        previewURL={CID_URL}
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={CID_URL}
      />
    </AppContext.Provider>
  );
}

/** The iframe branch is gated on WebGL availability, absent in jsdom. */
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

describe('ArtworkPlayer — an untyped source that is an image', () => {
  it('takes the image slot, not the fallback iframe, when the type probe fails', async () => {
    stubWebGL();
    contentTypeMock.mockRejectedValue(new Error('HEAD request failed: 429'));
    loadsAsImageMock.mockResolvedValue(true);

    const { container } = render(playerNode());

    const img = await waitFor(() => {
      const el = container.querySelector('img');
      if (!el?.src) {
        throw new Error('image slot has not been given a source yet');
      }
      return el;
    });
    expect(img.src).toBe(CID_URL);
    expect(loadsAsImageMock).toHaveBeenCalledWith(CID_URL);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('holds the slot as a bounded load while the image probe runs', async () => {
    // A playlist advances an expired slot whose load is unbounded. The probe
    // is bounded, so a short item must not be skipped during it.
    stubWebGL();
    contentTypeMock.mockRejectedValue(new Error('HEAD request failed: 429'));
    let settle: (isImage: boolean) => void = () => undefined;
    loadsAsImageMock.mockReturnValue(
      new Promise<boolean>(resolve => {
        settle = resolve;
      })
    );

    render(playerNode());

    await waitFor(() => {
      expect(loadsAsImageMock).toHaveBeenCalled();
    });
    expect(canvasService.isRenderLoadBounded()).toBe(true);
    await act(async () => {
      settle(true);
      await Promise.resolve();
    });
  });

  it('keeps the fallback iframe when the source does not decode as an image', async () => {
    stubWebGL();
    contentTypeMock.mockRejectedValue(new Error('HEAD request failed: 429'));
    loadsAsImageMock.mockResolvedValue(false);

    const { container } = render(playerNode());

    await waitFor(() => {
      if (!container.querySelector('iframe')) {
        throw new Error('fallback iframe has not mounted yet');
      }
    });
    const img = container.querySelector('img');
    expect(img?.getAttribute('src') ?? '').toBe('');
  });
});
