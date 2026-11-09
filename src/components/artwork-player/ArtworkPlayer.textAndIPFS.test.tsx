import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const source = 'https://gateway.example/ipfs/QmArtwork?fxhash=ooSeed';

/** Render with normal composition inputs so the software-URL effect runs. */
function mount(url: string, mimeType?: string) {
  return render(
    <AppContext.Provider
      value={
        {
          context: {
            isInitialized: true,
            isOnline: true,
            appRemoteConfig: {},
            displaySettings: {},
            deviceRotation: { viewMode: 'portrait' },
            cursorPositions: null,
            castInfo: null,
          },
        } as never
      }>
      <ArtworkPlayer
        previewURL={url}
        artworkPreviewMIMEType={mimeType}
        displayPreferences={defaultDP1DisplayPreference}
      />
    </AppContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  canvasService.setCastInfo(null, false);
  canvasService.setRenderStatus(undefined);
  vi.restoreAllMocks();
});

describe('plain-text contrast', () => {
  it.each([
    'text/plain',
    'text/plain; charset=utf-8',
    'TEXT/PLAIN; charset=UTF-8',
  ])('gives %s an opaque white canvas', async mimeType => {
    const { container } = mount('https://example.com/drawing', mimeType);
    await waitFor(() => {
      expect(container.querySelector('iframe')?.style.backgroundColor).toBe(
        'rgb(255, 255, 255)'
      );
    });
  });

  it('keeps HTML transparency intact', async () => {
    const { container } = mount('https://example.com/work', 'text/html');
    await waitFor(() => {
      expect(container.querySelector('iframe')).not.toBeNull();
    });
    expect(container.querySelector('iframe')?.style.backgroundColor).toBe('');
  });
});

describe('IPFS directory seed preservation', () => {
  it.each([undefined, 'text/html'])(
    'uses the verified directory URL with declared MIME %s',
    async mimeType => {
      const reply = new Response(null, {
        headers: { 'Content-Type': 'text/html' },
      });
      Object.defineProperties(reply, {
        url: { value: 'https://gateway.example/ipfs/QmArtwork/' },
        redirected: { value: true },
      });
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(reply)
        .mockResolvedValue(
          new Response(null, {
            headers: { 'Content-Type': 'text/html' },
          })
        );
      const { container } = mount(source, mimeType);
      await waitFor(() => {
        expect(container.querySelector('iframe')?.src).toBe(
          source.replace('?', '/?') + '&display_mode=fit'
        );
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    }
  );

  it('retains a cached redirect chain when the corrected URL is absent from replay', async () => {
    const destination = 'https://gateway.example/ipfs/QmArtwork/';
    const cachedGETs = new Map([
      [source, { status: 301, location: destination }],
      [destination, { status: 200, location: '' }],
    ]);
    vi.spyOn(globalThis, 'fetch').mockImplementation(input => {
      const url = new URL(input instanceof Request ? input.url : input);
      // Match FFOS HEAD replay: remove only the player's probe parameters.
      url.searchParams.delete('v');
      url.searchParams.delete('x-request');
      const resource = cachedGETs.get(url.href);
      if (!resource) {
        return Promise.reject(new TypeError('Replay miss: fail closed'));
      }
      const reply = new Response(null, {
        headers: { 'Content-Type': 'text/html' },
      });
      Object.defineProperties(reply, {
        url: { value: resource.location || url.href },
        redirected: { value: resource.status === 301 },
      });
      return Promise.resolve(reply);
    });
    const { container } = mount(source);
    await waitFor(
      () => {
        expect(container.querySelector('iframe')?.src).toBe(
          source + '&display_mode=fit'
        );
      },
      { timeout: 5000 }
    );
  });

  it('keeps an authored HTML source renderable when the optional redirect probe is blocked', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('CORS'));
    const { container } = mount(source, 'text/html');
    await waitFor(
      () => {
        expect(container.querySelector('iframe')?.src).toBe(
          source + '&display_mode=fit'
        );
      },
      { timeout: 5000 }
    );
  });
});
