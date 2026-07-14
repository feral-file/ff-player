import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { RenderStatus } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const loaderState = vi.hoisted(() => ({
  mode: 'fast' as 'fast' | 'slow' | 'fail' | 'cached',
}));

vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => ({
      loadMedia: (options: {
        url: string;
        mediaType: string;
        onLoad?: () => void;
        onError?: (error: Error) => void;
      }) => {
        void options.url;
        void options.mediaType;

        if (loaderState.mode === 'fast') {
          options.onLoad?.();
          return undefined;
        }

        if (loaderState.mode === 'cached') {
          return undefined;
        }

        if (loaderState.mode === 'fail') {
          options.onError?.(new Error('load failed'));
          return undefined;
        }

        const delay = 2500;
        setTimeout(() => {
          options.onLoad?.();
        }, delay);
        return undefined;
      },
      cleanup: () => undefined,
    }),
  };
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('hls.js', () => ({
  __esModule: true,
  default: Object.assign(vi.fn(), {
    isSupported: () => false,
    Events: {
      MEDIA_ATTACHED: 'MEDIA_ATTACHED',
      ERROR: 'ERROR',
    },
  }),
}));

function renderWithContext(
  ui: React.ReactElement,
  appRemoteConfig?: Record<string, unknown>
): ReturnType<typeof render> {
  return render(buildArtworkProvider(ui, appRemoteConfig));
}

function buildArtworkProvider(
  ui: React.ReactElement,
  appRemoteConfig?: Record<string, unknown>
): React.ReactElement {
  const value = {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig: appRemoteConfig ?? {},
      displaySettings: null,
      cursorPositions: null,
      castInfo: null,
    },
  };
  return <AppContext.Provider value={value as never}>{ui}</AppContext.Provider>;
}

function artworkTree(
  previewURL: string,
  appRemoteConfig?: Record<string, unknown>
): React.ReactElement {
  return buildArtworkProvider(
    <ArtworkPlayer
      previewURL={previewURL}
      artworkPreviewMIMEType="image/jpeg"
      displayPreferences={defaultDP1DisplayPreference}
    />,
    appRemoteConfig
  );
}

function renderArtworkPlayer(
  previewURL: string,
  appRemoteConfig?: Record<string, unknown>
) {
  return render(artworkTree(previewURL, appRemoteConfig));
}

async function advanceTimersBy(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await Promise.resolve();
  });
}

async function settleReact() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function flushTimers() {
  await act(async () => {
    await vi.runAllTimersAsync();
    await Promise.resolve();
  });
}

beforeEach(() => {
  loaderState.mode = 'fast';
});

afterEach(() => {
  canvasService.setCastInfo(null, false);
  canvasService.setRenderStatus(undefined);
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ArtworkPlayer render status - ready and failure transitions', () => {
  it('keeps fast image artwork in ready without showing loading', async () => {
    loaderState.mode = 'fast';

    renderWithContext(
      <ArtworkPlayer
        previewURL="https://feralfile.com/test/fast-image.jpg"
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('marks cached image artwork ready even if the load callback is missed', async () => {
    loaderState.mode = 'cached';

    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(320);

    renderWithContext(
      <ArtworkPlayer
        previewURL="https://feralfile.com/test/cached-image.jpg"
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('marks render failed when a valid image load errors', async () => {
    loaderState.mode = 'fail';

    renderWithContext(
      <ArtworkPlayer
        previewURL="https://feralfile.com/test/fail-image.jpg"
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
    });
    expect(screen.queryByText('Loading...')).toBeNull();
  });
});

describe('ArtworkPlayer render status - loading overlay switch', () => {
  it('keeps the loading overlay visible until the incoming artwork becomes visible', async () => {
    vi.useFakeTimers();
    loaderState.mode = 'fast';

    const { rerender } = renderArtworkPlayer('https://feralfile.com/test/fast-image.jpg');

    await act(async () => {
      await Promise.resolve();
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(screen.queryByText('Loading...')).toBeNull();

    loaderState.mode = 'slow';

    rerender(artworkTree('https://feralfile.com/test/slow-image.jpg'));

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);

    await advanceTimersBy(2000);

    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);

    await advanceTimersBy(500);

    await settleReact();
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
    expect(screen.getByText('Loading...')).toBeTruthy();

    await flushTimers();
    await flushTimers();

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('shows loading only after 2s for a slow image and then returns to ready', async () => {
    vi.useFakeTimers();
    loaderState.mode = 'slow';

    renderWithContext(
      <ArtworkPlayer
        previewURL="https://feralfile.com/test/slow-image.jpg"
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
      />
    );

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
    expect(screen.queryByText('Loading...')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('suppresses the loading overlay when the runtime flag is disabled', async () => {
    vi.useFakeTimers();
    loaderState.mode = 'slow';

    renderWithContext(
      <ArtworkPlayer
        previewURL="https://feralfile.com/test/slow-image.jpg"
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
      />,
      { showRenderLoadingOverlay: false }
    );

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
    expect(screen.queryByText('Loading...')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
    expect(screen.queryByText('Loading...')).toBeNull();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(screen.queryByText('Loading...')).toBeNull();
  });
});
