/**
 * Renderer coverage for source forms accepted at CanvasService's cast boundary.
 * Relative forms need an absolute iframe-settings URL, while data payloads must
 * remain byte-for-byte intact because their text is the artwork itself.
 */
import { AppContext } from '@/context/AppContext';
import { Scaling, defaultDP1DisplayPreference } from '@/models/dp1.model';
import { cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const relativeSources = [
  ['relative', 'artwork.html', 'http://localhost:3000/artwork.html'],
  ['protocol-relative', '//cdn.example.com/artwork.html', 'http://cdn.example.com/artwork.html'],
] as const;

/**
 * The display-mode hint must join the source's query string so that stripping
 * `display_mode` returns the captured replay key byte-for-byte — a query-less
 * source previously produced `?&display_mode=...`, whose empty leading pair
 * reduces to a dangling `?` on strip, missing the key and failing a fully
 * cached artwork closed to Chromium's error page.
 *
 * These cases pin the wiring through the component. The reversibility
 * contract itself, including why an explicit empty query keeps its `?&` form
 * while a query-less source does not, is owned and exhaustively tested by
 * `appendDisplayModeParam` in utils/helper.test.ts.
 */
const querySeparatorSources = [
  [
    'no query string',
    'https://generator.artblocks.io/1/0xabc/147000065',
    'https://generator.artblocks.io/1/0xabc/147000065?display_mode=crop',
  ],
  [
    'existing query string',
    'https://cdn.example.com/previews/x/?edition_number=0&blockchain=bitmark',
    'https://cdn.example.com/previews/x/?edition_number=0&blockchain=bitmark&display_mode=crop',
  ],
  [
    'percent-encoded query preserved verbatim',
    'https://cdn.example.com/a?path=%2Fnested&b=1',
    'https://cdn.example.com/a?path=%2Fnested&b=1&display_mode=crop',
  ],
  [
    // Distinct from the query-less row above: this source's captured key
    // carries a trailing '?', so the hint must keep that delimiter.
    'empty query string',
    'https://cdn.example.com/a?',
    'https://cdn.example.com/a?&display_mode=crop',
  ],
] as const;

/** Tiny valid payloads so MIME discovery selects the media renderer without network. */
const base64MediaSources = [
  [
    'image',
    'img',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ],
  ['video', 'video', 'data:video/mp4;base64,AAAA'],
  ['audio', 'audio', 'data:audio/mpeg;base64,SUQz'],
] as const;

function renderArtwork(source: string, artworkPreviewMIMEType?: string) {
  const value = {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig: {},
      displaySettings: { scaling: Scaling.Fill },
      deviceRotation: { viewMode: 'landscape' },
      cursorPositions: null,
      castInfo: null,
    },
  };
  return render(
    <AppContext.Provider value={value as never}>
      <ArtworkPlayer
        previewURL={source}
        artworkPreviewMIMEType={artworkPreviewMIMEType}
        displayPreferences={defaultDP1DisplayPreference}
      />
    </AppContext.Provider>
  );
}

afterEach(cleanup);

describe('ArtworkPlayer — accepted artwork source compatibility', () => {
  it.each(relativeSources)(
    'renders %s iframe sources with display settings',
    async (_kind, source, expectedURL) => {
      const { container } = renderArtwork(source, 'text/html');

      await waitFor(() => {
        const iframe = container.querySelector('iframe');
        expect(iframe).toBeTruthy();
        expect(iframe?.src).toBe(`${expectedURL}?display_mode=crop`);
      });
    }
  );

  it.each(querySeparatorSources)(
    'joins the display-mode hint to a source with %s',
    async (_kind, source, expectedURL) => {
      const { container } = renderArtwork(source, 'text/html');

      await waitFor(() => {
        const iframe = container.querySelector('iframe');
        expect(iframe).toBeTruthy();
        expect(iframe?.getAttribute('src')).toBe(expectedURL);
      });
    }
  );

  it('does not append display settings to a raw data payload', async () => {
    const source = 'data:text/html,<h1>100% artwork</h1>';
    const { container } = renderArtwork(source, 'text/html');

    await waitFor(() => {
      const iframe = container.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute('src')).toBe(source);
    });
  });

  it.each(base64MediaSources)(
    'selects the %s renderer from a playlist data URL without an injected MIME type',
    async (_kind, selector, source) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const { container } = renderArtwork(source);

      await waitFor(() => {
        expect(container.querySelector(selector)).toBeTruthy();
      });

      expect(container.querySelector('iframe')).toBeNull();
      // Media loaders may fetch data: bytes for blob conversion, but MIME
      // discovery must not probe with a cache-busting HEAD that corrupts them.
      expect(
        fetchSpy.mock.calls.some(([requestURL, init]) => {
          const method =
            init && typeof init === 'object' && 'method' in init && init.method
              ? init.method.toUpperCase()
              : 'GET';
          return (
            method === 'HEAD' ||
            (typeof requestURL === 'string' &&
              requestURL.includes('x-request=xhr'))
          );
        })
      ).toBe(false);
      fetchSpy.mockRestore();
    }
  );
});
