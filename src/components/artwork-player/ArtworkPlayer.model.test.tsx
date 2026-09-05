import { AppContext } from '@/context/AppContext';
import { RenderStatus } from '@/models';
import { defaultDP1DisplayPreference, Scaling } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
const MODEL_URL_B =
  'https://ipfs.filebase.io/ipfs/bafybeidifferentmodelcidforstaleerrorcase';
const IMAGE_URL = 'https://example.com/image.png';

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

/**
 * Renders the player with a persisted device record of `fit`. Scaling reaches
 * the iframe URL from the item's merged preference; the device record is the
 * merge's lowest layer, not an override, so it must not win over the item.
 */
function renderWithDisplaySettings(
  ui: React.ReactElement
): ReturnType<typeof render> {
  const value = {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig: {},
      displaySettings: { scaling: Scaling.Fit },
      deviceRotation: { viewMode: 'landscape' },
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
  canvasService.setCastInfo(null, false);
  canvasService.setRenderStatus(undefined);
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

  it('falls back to iframe for unsupported non-glTF model MIME types', async () => {
    const { container } = renderWithContext(
      <ArtworkPlayer
        previewURL={MODEL_URL}
        artworkPreviewMIMEType="model/stl"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('iframe')).toBeTruthy();
    });

    expect(container.querySelector('model-viewer')).toBeNull();
  });
});

describe('ArtworkPlayer — relative iframe display settings', () => {
  it('resolves a relative iframe source before applying display mode', async () => {
    helperMocks.getContentTypeFromURL.mockResolvedValue('application/octet-stream');

    const { container } = renderWithDisplaySettings(
      <ArtworkPlayer
        previewURL="artwork.html"
        displayPreferences={{
          ...defaultDP1DisplayPreference,
          scaling: Scaling.Fill,
        }}
      />
    );

    const iframe = await waitFor(() => {
      const node = container.querySelector('iframe');
      if (!node) {
        throw new Error('iframe element was not rendered');
      }
      return node;
    });

    expect(iframe.getAttribute('src')).toContain('/artwork.html');
    expect(iframe.getAttribute('src')).toContain('display_mode=crop');
  });
});

describe('ArtworkPlayer — model successful transition', () => {
  it('commits a loaded model slot over the previous artwork', async () => {
    const { container, rerender } = renderWithContext(
      <ArtworkPlayer
        previewURL={IMAGE_URL}
        artworkPreviewMIMEType="image/png"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
    });

    rerender(
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
            },
          } as never
        }>
        <ArtworkPlayer
          previewURL={MODEL_URL}
          artworkPreviewMIMEType="model/gltf-binary"
          displayPreferences={defaultDP1DisplayPreference}
        />
      </AppContext.Provider>
    );

    const modelViewerEl = await waitFor(() => {
      const node = container.querySelector('model-viewer');
      if (!node) {
        throw new Error('model-viewer element was not rendered');
      }
      return node;
    });

    modelViewerEl.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(container.querySelector('img')).toBeNull();
    });

    expect(screen.queryByText('Unable to load 3D model')).toBeNull();
    expect(screen.queryByText('Loading 3D model')).toBeNull();
  });
});

describe('ArtworkPlayer — model runtime error handling', () => {
  it('commits a failed model slot over the previous artwork on runtime error', async () => {
    const { container, rerender } = renderWithContext(
      <ArtworkPlayer
        previewURL={IMAGE_URL}
        artworkPreviewMIMEType="image/png"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
    });

    rerender(
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
            },
          } as never
        }>
        <ArtworkPlayer
          previewURL={MODEL_URL}
          artworkPreviewMIMEType="model/gltf-binary"
          displayPreferences={defaultDP1DisplayPreference}
        />
      </AppContext.Provider>
    );

    const modelViewerEl = await waitFor(() => {
      const node = container.querySelector('model-viewer');
      if (!node) {
        throw new Error('model-viewer element was not rendered');
      }
      return node;
    });

    modelViewerEl.dispatchEvent(new Event('error'));

    await waitFor(() => {
      expect(screen.getByText('Unable to load 3D model')).toBeTruthy();
    });

    await waitFor(() => {
      expect(container.querySelector('img')).toBeNull();
    });

    expect(screen.queryByText('Loading 3D model')).toBeNull();
  });
});

describe('ArtworkPlayer — stale model error handling', () => {
  it('ignores stale model errors after the preview URL changes', async () => {
    const { container, rerender } = renderWithContext(
      <ArtworkPlayer
        previewURL={MODEL_URL}
        artworkPreviewMIMEType="model/gltf-binary"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    const staleModelViewerEl = await waitFor(() => {
      const node = container.querySelector('model-viewer');
      if (!node) {
        throw new Error('model-viewer element was not rendered');
      }
      return node;
    });

    rerender(
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
            },
          } as never
        }>
        <ArtworkPlayer
          previewURL={MODEL_URL_B}
          artworkPreviewMIMEType="model/gltf-binary"
          displayPreferences={defaultDP1DisplayPreference}
        />
      </AppContext.Provider>
    );

    await waitFor(() => {
      expect(container.querySelectorAll('model-viewer')).toHaveLength(2);
    });

    staleModelViewerEl.dispatchEvent(new Event('error'));

    await waitFor(() => {
      expect(screen.queryByText('Unable to load 3D model')).toBeNull();
    });
  });
});

describe('ArtworkPlayer — model render status', () => {
  it('reports ready after model-viewer load completes', async () => {
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

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);

    modelViewerEl.dispatchEvent(new Event('load'));

    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });
  });

  it('reports failed when model-viewer errors for the current artwork', async () => {
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

    modelViewerEl.dispatchEvent(new Event('error'));

    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
    });
  });
});

describe('ArtworkPlayer — model loading overlay timing', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    vi.useRealTimers();
  });

  it('holds the model overlay for the same 2s delay as every other type', async () => {
    vi.useFakeTimers();
    const { container } = renderWithContext(
      <ArtworkPlayer
        previewURL={MODEL_URL}
        artworkPreviewMIMEType="model/gltf-binary"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(container.querySelector('model-viewer')).toBeTruthy();
    // A model that loads quickly must not flash a spinner the rest of the
    // player deliberately suppresses for the first two seconds.
    expect(screen.queryByText('Loading 3D model')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(screen.queryByText('Loading 3D model')).toBeTruthy();
    // And exactly one overlay: a painted, still-loading model suppresses the
    // global one, which is the whole reason that suppression branch exists.
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('shows the global overlay for a slow transition into a model', async () => {
    vi.useFakeTimers();
    const { rerender } = renderWithContext(
      <ArtworkPlayer
        previewURL={IMAGE_URL}
        artworkPreviewMIMEType="image/png"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity="item-image"
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    rerender(
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
            },
          } as never
        }>
        <ArtworkPlayer
          previewURL={MODEL_URL}
          artworkPreviewMIMEType="model/gltf-binary"
          displayPreferences={defaultDP1DisplayPreference}
          itemIdentity="item-model"
        />
      </AppContext.Provider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    // The incoming model slot is still at opacity 0, so ModelViewerScreen's own
    // overlay cannot be seen. Suppressing the global one here would leave a slow
    // model transition with no indicator at all.
    expect(screen.queryByText('Loading...')).toBeTruthy();
  });
});
