/* eslint-disable max-lines, max-lines-per-function -- This file intentionally groups scenario tests for the render-status flow. */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { RenderStatus } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const loaderState = vi.hoisted(() => ({
  mode: 'fast' as 'fast' | 'slow' | 'fail' | 'slow-fail' | 'manual' | 'cached',
  delays: [] as number[],
  calls: [] as {
    onLoad?: () => void;
    onError?: (error: Error) => void;
  }[],
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

        if (loaderState.mode === 'slow-fail') {
          const delay = loaderState.delays.shift() ?? 2500;
          setTimeout(() => {
            options.onError?.(new Error('load failed'));
          }, delay);
          return undefined;
        }

        if (loaderState.mode === 'manual') {
          loaderState.calls.push(options);
          return undefined;
        }

        const delay = loaderState.delays.shift() ?? 2500;
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
  appRemoteConfig?: Record<string, unknown>,
  itemIdentity?: string,
  artworkPreviewMIMEType = 'image/jpeg'
): React.ReactElement {
  return buildArtworkProvider(
    <ArtworkPlayer
      previewURL={previewURL}
      artworkPreviewMIMEType={artworkPreviewMIMEType}
      displayPreferences={defaultDP1DisplayPreference}
      itemIdentity={itemIdentity}
    />,
    appRemoteConfig
  );
}

function renderArtworkPlayer(
  previewURL: string,
  appRemoteConfig?: Record<string, unknown>,
  itemIdentity?: string,
  artworkPreviewMIMEType = 'image/jpeg'
) {
  return render(
    artworkTree(
      previewURL,
      appRemoteConfig,
      itemIdentity,
      artworkPreviewMIMEType
    )
  );
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

function ensureWebGLConstructors() {
  if (typeof globalThis.WebGLRenderingContext === 'undefined') {
    Object.defineProperty(globalThis, 'WebGLRenderingContext', {
      configurable: true,
      value: function WebGLRenderingContext() {
        return undefined;
      },
    });
  }
  if (typeof globalThis.WebGL2RenderingContext === 'undefined') {
    Object.defineProperty(globalThis, 'WebGL2RenderingContext', {
      configurable: true,
      value: function WebGL2RenderingContext() {
        return undefined;
      },
    });
  }
}

beforeEach(() => {
  loaderState.mode = 'fast';
  loaderState.delays = [];
  loaderState.calls = [];
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

  it('waits for decode before committing a cached image slot', async () => {
    loaderState.mode = 'cached';

    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(320);

    // A cached image is already complete before onload can attach, so the
    // commit runs from the completeness shortcut. It must still go through the
    // decode gate, otherwise the first rasterization of a large image lands
    // inside the crossfade frame.
    let resolveDecode: () => void = () => undefined;
    const decodeSpy = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveDecode = resolve;
        })
    );
    // jsdom's HTMLImageElement has no decode(), so define it rather than spy.
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      writable: true,
      value: decodeSpy,
    });

    try {
      renderWithContext(
        <ArtworkPlayer
          previewURL="https://feralfile.com/test/cached-decode.jpg"
          artworkPreviewMIMEType="image/jpeg"
          displayPreferences={defaultDP1DisplayPreference}
        />
      );

      await waitFor(() => {
        expect(decodeSpy).toHaveBeenCalled();
      });
      expect(canvasService.getStatus().renderStatus).not.toBe(
        RenderStatus.ready
      );

      await act(async () => {
        resolveDecode();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
      });
    } finally {
      delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
    }
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

  it.each([
    ['HTML iframe', 'text/html'],
    ['PDF iframe', 'application/pdf'],
  ])(
    'keeps %s loading after load because navigation is not render verification',
    async (_label, artworkPreviewMIMEType) => {
      ensureWebGLConstructors();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        {} as RenderingContext
      );
      const { container } = renderArtworkPlayer(
        'https://feralfile.com/test/unverified-document',
        undefined,
        undefined,
        artworkPreviewMIMEType
      );

      const iframe = await waitFor(() => {
        const node = container.querySelector('iframe');
        if (!node) {
          throw new Error('iframe was not rendered');
        }
        return node;
      });

      await act(async () => {
        iframe.dispatchEvent(new Event('load'));
        await Promise.resolve();
      });

      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
      expect(screen.queryByText('Loading...')).toBeNull();
    }
  );

  it('keeps a stale load from promoting a newer artwork that reuses the same URL', async () => {
    vi.useFakeTimers();
    loaderState.mode = 'slow';
    loaderState.delays = [2500, 5000];

    const previewURL = 'https://feralfile.com/test/shared-image.jpg';

    const { rerender } = renderArtworkPlayer(previewURL, undefined, 'item-a');

    await act(async () => {
      await Promise.resolve();
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);

    rerender(artworkTree(previewURL, undefined, 'item-b'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
    expect(screen.getByText('Loading...')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2400);
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
  });

  it('ignores a stale error after a newer artwork has taken over', async () => {
    vi.useFakeTimers();
    loaderState.mode = 'manual';

    const { rerender } = renderArtworkPlayer(
      'https://feralfile.com/test/stale-error-old.jpg',
      undefined,
      'item-old'
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
    const staleError = loaderState.calls[0]?.onError;
    expect(staleError).toBeTypeOf('function');

    loaderState.mode = 'fast';
    rerender(
      artworkTree(
        'https://feralfile.com/test/stale-error-new.jpg',
        undefined,
        'item-new'
      )
    );

    await flushTimers();
    await flushTimers();
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(screen.queryByText('The artwork cannot be displayed correctly on this device.')).toBeNull();

    staleError?.(new Error('load failed'));
    await settleReact();

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(screen.queryByText('The artwork cannot be displayed correctly on this device.')).toBeNull();
  });

  it('ignores a stale outgoing video load error after same-URL identity takeover', async () => {
    vi.useFakeTimers();
    loaderState.mode = 'manual';
    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, 'pause').mockImplementation(
      () => undefined
    );

    const sharedURL = 'https://feralfile.com/test/shared-video.mp4';
    const { rerender } = renderArtworkPlayer(
      sharedURL,
      undefined,
      'item-old',
      'video/mp4'
    );

    await settleReact();

    const staleError = loaderState.calls[0]?.onError;
    expect(staleError).toBeTypeOf('function');

    rerender(
      artworkTree(sharedURL, undefined, 'item-new', 'video/mp4')
    );

    await settleReact();
    expect(loaderState.calls.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      loaderState.calls[1]?.onLoad?.();
      await Promise.resolve();
    });

    await advanceTimersBy(650);

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);

    staleError?.(new Error('stale video load failed'));
    await settleReact();

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(
      screen.queryByText('The artwork cannot be displayed correctly on this device.')
    ).toBeNull();
  });

  it('ignores a stale video load error after the same slot index is reused', async () => {
    vi.useFakeTimers();
    loaderState.mode = 'manual';
    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, 'pause').mockImplementation(
      () => undefined
    );

    const { rerender } = renderArtworkPlayer(
      'https://feralfile.com/test/video-old.mp4',
      undefined,
      'item-old',
      'video/mp4'
    );
    await settleReact();
    const staleError = loaderState.calls[0]?.onError;
    expect(staleError).toBeTypeOf('function');

    await act(async () => {
      loaderState.calls[0]?.onLoad?.();
      await Promise.resolve();
    });

    rerender(
      artworkTree(
        'https://feralfile.com/test/video-middle.mp4',
        undefined,
        'item-middle',
        'video/mp4'
      )
    );
    await settleReact();
    await act(async () => {
      loaderState.calls[1]?.onLoad?.();
      await Promise.resolve();
    });
    await advanceTimersBy(650);

    rerender(
      artworkTree(
        'https://feralfile.com/test/video-current.mp4',
        undefined,
        'item-current',
        'video/mp4'
      )
    );
    await settleReact();
    await act(async () => {
      loaderState.calls[2]?.onLoad?.();
      await Promise.resolve();
    });
    await advanceTimersBy(650);

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);

    staleError?.(new Error('old slot video load failed'));
    await settleReact();

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(
      screen.queryByText('The artwork cannot be displayed correctly on this device.')
    ).toBeNull();
  });

  it('ignores a stale video load success after the same slot index is reused', async () => {
    vi.useFakeTimers();
    loaderState.mode = 'manual';
    vi.spyOn(HTMLVideoElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLVideoElement.prototype, 'pause').mockImplementation(
      () => undefined
    );

    const { rerender } = renderArtworkPlayer(
      'https://feralfile.com/test/success-old.mp4',
      undefined,
      'item-old',
      'video/mp4'
    );
    await settleReact();
    const staleLoad = loaderState.calls[0]?.onLoad;
    expect(staleLoad).toBeTypeOf('function');

    await act(async () => {
      loaderState.calls[0]?.onLoad?.();
      await Promise.resolve();
    });

    rerender(
      artworkTree(
        'https://feralfile.com/test/success-middle.mp4',
        undefined,
        'item-middle',
        'video/mp4'
      )
    );
    await settleReact();
    await act(async () => {
      loaderState.calls[1]?.onLoad?.();
      await Promise.resolve();
    });
    await advanceTimersBy(650);

    rerender(
      artworkTree(
        'https://feralfile.com/test/success-current.mp4',
        undefined,
        'item-current',
        'video/mp4'
      )
    );
    await settleReact();
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);

    staleLoad?.();
    await settleReact();

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
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

  it('clears a failure modal when a later artwork becomes ready', async () => {
    loaderState.mode = 'fail';

    const { rerender } = renderArtworkPlayer(
      'https://feralfile.com/test/fail-first.jpg',
      undefined,
      'item-fail'
    );

    await waitFor(() => {
      expect(
        screen.getByText('The artwork cannot be displayed correctly on this device.')
      ).toBeTruthy();
    });

    loaderState.mode = 'fast';

    rerender(
      artworkTree(
        'https://feralfile.com/test/recovery.jpg',
        undefined,
        'item-recovery'
      )
    );

    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });

    expect(
      screen.queryByText('The artwork cannot be displayed correctly on this device.')
    ).toBeNull();
  });
});
