import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const helperMocks = vi.hoisted(() => ({
  getContentTypeFromURL: vi.fn(),
}));

vi.mock('@/utils/helper', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/helper')>();
  return {
    ...mod,
    getContentTypeFromURL: helperMocks.getContentTypeFromURL,
  };
});

vi.mock('@google/model-viewer', () => {
  if (!customElements.get('model-viewer')) {
    customElements.define('model-viewer', class extends HTMLElement {});
  }
  return {};
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const MODEL_URL =
  'https://ipfs.filebase.io/ipfs/bafybeiht7hyohzvnje3aozwfkoqowuvmb7fooqh4pbyigzv6qm2dolwgxu';

function renderWithContext(ui: React.ReactElement): ReturnType<typeof render> {
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
  return render(
    <AppContext.Provider value={value as never}>{ui}</AppContext.Provider>
  );
}

afterEach(() => {
  helperMocks.getContentTypeFromURL.mockReset();
  cleanup();
});

describe('ArtworkPlayer — GLB / model mime routing', () => {
  it('renders model-viewer from the real playlist discovery path when HEAD reports a model MIME type', async () => {
    helperMocks.getContentTypeFromURL.mockResolvedValue('model/gltf-binary');

    const { container } = renderWithContext(
      <ArtworkPlayer
        previewURL={MODEL_URL}
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(helperMocks.getContentTypeFromURL).toHaveBeenCalledWith(
        MODEL_URL
      );
    });

    const modelViewerEl = await waitFor(() => {
      const node = container.querySelector('model-viewer');
      if (!node) {
        throw new Error('model-viewer element was not rendered');
      }
      return node;
    });

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('object')).toBeNull();
    expect(modelViewerEl.getAttribute('src')).toBe(MODEL_URL);
  });

  it('falls back to iframe when discovery returns a generic content type', async () => {
    helperMocks.getContentTypeFromURL.mockResolvedValue('application/octet-stream');

    const { container } = renderWithContext(
      <ArtworkPlayer
        previewURL={MODEL_URL}
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(helperMocks.getContentTypeFromURL).toHaveBeenCalledWith(
        MODEL_URL
      );
    });

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });

    expect(container.querySelector('model-viewer')).toBeNull();
  });

  it('renders model-viewer directly for model/gltf-binary previews', async () => {
    const { container } = renderWithContext(
      <ArtworkPlayer
        previewURL={MODEL_URL}
        artworkPreviewMIMEType="model/gltf-binary"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    const modelViewerEl = await waitFor(() => {
      const node = container.querySelector('model-viewer');
      if (!node) {
        throw new Error('model-viewer element was not rendered');
      }
      return node;
    });

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('object')).toBeNull();
    expect(modelViewerEl.getAttribute('src')).toBe(MODEL_URL);
  });
});
