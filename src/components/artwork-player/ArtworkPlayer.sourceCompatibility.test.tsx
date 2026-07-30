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

function renderArtwork(source: string) {
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
        artworkPreviewMIMEType="text/html"
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
      const { container } = renderArtwork(source);

      await waitFor(() => {
        const iframe = container.querySelector('iframe');
        expect(iframe).toBeTruthy();
        expect(iframe?.src).toBe(`${expectedURL}?&display_mode=crop`);
      });
    }
  );

  it('does not append display settings to a raw data payload', async () => {
    const source = 'data:text/html,<h1>100% artwork</h1>';
    const { container } = renderArtwork(source);

    await waitFor(() => {
      const iframe = container.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute('src')).toBe(source);
    });
  });
});
