import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const helperMocks = vi.hoisted(() => ({
  getContentTypeFromURL: vi.fn(),
}));

const mediaLoaderMocks = vi.hoisted(() => ({
  loadMedia: vi.fn(({ onLoad }: { onLoad?: () => void }) => {
    onLoad?.();
    return { success: true, usedBlob: false };
  }),
}));

vi.mock('@/utils/helper', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/helper')>();
  return {
    ...mod,
    getContentTypeFromURL: helperMocks.getContentTypeFromURL,
  };
});

vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => ({
      loadMedia: mediaLoaderMocks.loadMedia,
      cleanup: vi.fn(),
    }),
  };
});

vi.mock('@google/model-viewer', () => {
  throw new Error('model-viewer chunk failed');
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const MODEL_URL =
  'https://ipfs.filebase.io/ipfs/bafybeiht7hyohzvnje3aozwfkoqowuvmb7fooqh4pbyigzv6qm2dolwgxu';
const IMAGE_URL = 'https://example.com/image.png';

const appContextValue = {
  context: {
    isInitialized: true,
    isOnline: true,
    appRemoteConfig: {},
    displaySettings: null,
    cursorPositions: null,
    castInfo: null,
  },
};

function renderWithContext(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <AppContext.Provider value={appContextValue as never}>{ui}</AppContext.Provider>
  );
}

afterEach(() => {
  helperMocks.getContentTypeFromURL.mockReset();
  mediaLoaderMocks.loadMedia.mockClear();
  cleanup();
});

describe('ArtworkPlayer — model bootstrap error handling', () => {
  it('settles the error state without leaving the loading overlay visible', async () => {
    helperMocks.getContentTypeFromURL.mockResolvedValue('model/gltf-binary');

    renderWithContext(
      <ArtworkPlayer
        previewURL={MODEL_URL}
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
    });

    expect(screen.queryByText('Loading 3D model')).toBeNull();
  });

  it('replaces the previous artwork when a model transition bootstrap fails', async () => {
    const { container, rerender } = renderWithContext(
      <ArtworkPlayer
        previewURL={IMAGE_URL}
        artworkPreviewMIMEType="image/png"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(mediaLoaderMocks.loadMedia).toHaveBeenCalled();
    });
    expect(container.querySelector('img')).toBeTruthy();

    rerender(
      <AppContext.Provider value={appContextValue as never}>
        <ArtworkPlayer
          previewURL={MODEL_URL}
          artworkPreviewMIMEType="model/gltf-binary"
          displayPreferences={defaultDP1DisplayPreference}
        />
      </AppContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
    });

    await waitFor(() => {
      expect(container.querySelector('img')).toBeNull();
    });

    expect(screen.queryByText('Loading 3D model')).toBeNull();
  });
});
