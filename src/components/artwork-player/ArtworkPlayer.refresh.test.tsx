/**
 * Integration coverage for `refreshArtwork`: the reload tick must re-enter the same-URL
 * load path so image / progressive video / HLS setup runs again.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { RenderStatus } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const mediaLoadInstrumentation = vi.hoisted(() => ({
  calls: [] as { url: string; mediaType: string }[],
}));

vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => {
      const loader = mod.createMediaLoader();
      const origLoad = loader.loadMedia.bind(loader);
      loader.loadMedia = async options => {
        mediaLoadInstrumentation.calls.push({
          url: options.url,
          mediaType: options.mediaType,
        });
        return origLoad(options);
      };
      return loader;
    },
  };
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const hlsTest = vi.hoisted(() => ({
  loadSource: vi.fn(),
  instances: [] as {
    recoverMediaError: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }[],
  mediaAttachedHandlers: [] as (() => void)[],
  errorHandlers: [] as ((event: string, data: HlsErrorData) => void)[],
}));

interface HlsErrorData {
  fatal?: boolean;
  type?: string;
  details?: string;
}

vi.mock('hls.js', () => {
  const Events = {
    MEDIA_ATTACHED: 'hlsMediaAttached',
    ERROR: 'error',
  };
  const ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
  };
  const ErrorDetails = {
    BUFFER_NUDGE_ON_STALL: 'bufferNudgeOnStall',
  };

  class MockHls {
    static Events = Events;

    static ErrorTypes = ErrorTypes;

    static ErrorDetails = ErrorDetails;

    static isSupported(): boolean {
      return true;
    }

    constructor() {
      hlsTest.instances.push(this);
    }

    private mediaAttachedHandler: (() => void) | undefined;

    attachMedia(video: HTMLVideoElement): void {
      void video;
      queueMicrotask(() => {
        this.mediaAttachedHandler?.();
      });
    }

    on(
      event: string,
      handler: (() => void) | ((event: string, data: HlsErrorData) => void)
    ): void {
      if (event === Events.MEDIA_ATTACHED) {
        const mediaHandler = handler as () => void;
        this.mediaAttachedHandler = mediaHandler;
        hlsTest.mediaAttachedHandlers.push(mediaHandler);
      }
      if (event === Events.ERROR) {
        hlsTest.errorHandlers.push(
          handler as (event: string, data: HlsErrorData) => void
        );
      }
    }

    loadSource = hlsTest.loadSource;

    destroy = vi.fn();

    recoverMediaError = vi.fn();
  }

  return {
    __esModule: true,
    default: MockHls,
  };
});

const IMAGE_PREVIEW_URL = 'https://feralfile.com/test/artwork-refresh.jpg';
/** Progressive video: trusted origin + explicit MIME avoids HEAD; non-HLS video path. */
const VIDEO_PREVIEW_URL = 'https://feralfile.com/test/artwork-video-refresh.mp4';
/** ipfs.io is in KNOWN_ORIGINS so streaming setup can attach without blob fetch. */
const HLS_PREVIEW_URL = 'https://ipfs.io/ipfs/QmTest/stream.m3u8';
const HLS_PREVIEW_URL_B = 'https://ipfs.io/ipfs/QmTestB/stream.m3u8';
const HLS_PREVIEW_URL_C = 'https://ipfs.io/ipfs/QmTestC/stream.m3u8';
/** data: HTML so jsdom can complete iframe `load` without network (external src often never fires). */
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

function artworkPlayerWithContext(
  previewURL: string,
  itemIdentity: string
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
          },
        } as never
      }>
      <ArtworkPlayer
        previewURL={previewURL}
        artworkPreviewMIMEType="application/vnd.apple.mpegurl"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={itemIdentity}
      />
    </AppContext.Provider>
  );
}

describe('ArtworkPlayer — refresh reload tick (image)', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mediaLoadInstrumentation.calls.length = 0;
    hlsTest.instances.length = 0;
    hlsTest.mediaAttachedHandlers.length = 0;
    hlsTest.errorHandlers.length = 0;
    playSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'pause')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it('re-runs image media load when reload tick fires at the same preview URL', async () => {
    let performReload: (() => void) | null = null;

    renderWithContext(
      <ArtworkPlayer
        previewURL={IMAGE_PREVIEW_URL}
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
        onRegisterArtworkReload={fn => {
          performReload = fn;
        }}
      />
    );

    await waitFor(() => {
      expect(performReload).not.toBeNull();
    });

    await waitFor(() => {
      expect(mediaLoadInstrumentation.calls.length).toBeGreaterThanOrEqual(1);
    });

    const countBeforeReload = mediaLoadInstrumentation.calls.length;

    act(() => {
      performReload?.();
    });

    await waitFor(() => {
      expect(mediaLoadInstrumentation.calls.length).toBeGreaterThan(
        countBeforeReload
      );
    });

    const last = mediaLoadInstrumentation.calls.at(-1);
    expect(last?.mediaType).toBe('image');
    expect(last?.url).toBe(IMAGE_PREVIEW_URL);
  });
});

describe('ArtworkPlayer — refresh reload tick (HLS)', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mediaLoadInstrumentation.calls.length = 0;
    hlsTest.instances.length = 0;
    hlsTest.mediaAttachedHandlers.length = 0;
    hlsTest.errorHandlers.length = 0;
    playSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'pause')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    cleanup();
  });

  it('invokes Hls loadSource again when reload tick fires for an HLS item', async () => {
    hlsTest.loadSource.mockClear();
    let performReload: (() => void) | null = null;

    renderWithContext(
      <ArtworkPlayer
        previewURL={HLS_PREVIEW_URL}
        artworkPreviewMIMEType="application/vnd.apple.mpegurl"
        displayPreferences={defaultDP1DisplayPreference}
        onRegisterArtworkReload={fn => {
          performReload = fn;
        }}
      />
    );

    await waitFor(() => {
      expect(performReload).not.toBeNull();
    });

    await waitFor(() => {
      expect(hlsTest.loadSource).toHaveBeenCalled();
    });

    const countBefore = hlsTest.loadSource.mock.calls.length;

    act(() => {
      performReload?.();
    });

    await waitFor(() => {
      expect(hlsTest.loadSource.mock.calls.length).toBeGreaterThan(countBefore);
    });
  });

  it('recovers a current-slot fatal HLS stall without publishing failed', async () => {
    render(artworkPlayerWithContext(HLS_PREVIEW_URL, 'hls-stall-item'));

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });

    const activeHls = hlsTest.instances[0];
    act(() => {
      hlsTest.errorHandlers[0]('error', {
        fatal: true,
        type: 'mediaError',
        details: 'bufferNudgeOnStall',
      });
    });

    expect(activeHls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(activeHls.destroy).not.toHaveBeenCalled();
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(
      screen.queryByText('The artwork cannot be displayed correctly on this device.')
    ).toBeNull();
  });

});

describe('ArtworkPlayer — stale HLS media errors', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mediaLoadInstrumentation.calls.length = 0;
    hlsTest.instances.length = 0;
    hlsTest.mediaAttachedHandlers.length = 0;
    hlsTest.errorHandlers.length = 0;
    playSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'pause')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it('ignores a stale outgoing HLS media error after same-URL identity takeover', async () => {
    hlsTest.loadSource.mockClear();

    const { rerender } = render(
      artworkPlayerWithContext(HLS_PREVIEW_URL, 'item-old')
    );

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
    });

    const staleErrorHandler = hlsTest.errorHandlers[0];
    const staleHandlerCount = hlsTest.errorHandlers.length;

    rerender(artworkPlayerWithContext(HLS_PREVIEW_URL, 'item-new'));

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(staleHandlerCount);
    });
    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });

    act(() => {
      staleErrorHandler('error', {
        fatal: true,
        type: 'mediaError',
      });
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(
      screen.queryByText('The artwork cannot be displayed correctly on this device.')
    ).toBeNull();
  });

});

describe('ArtworkPlayer — stale HLS media errors after slot reuse', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mediaLoadInstrumentation.calls.length = 0;
    hlsTest.instances.length = 0;
    hlsTest.errorHandlers.length = 0;
    playSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'pause')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it('ignores a stale HLS media error after the same slot index is reused', async () => {
    const { rerender } = render(
      artworkPlayerWithContext(HLS_PREVIEW_URL, 'item-old')
    );

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
    });

    const staleErrorHandler = hlsTest.errorHandlers[0];
    const firstHandlerCount = hlsTest.errorHandlers.length;

    rerender(artworkPlayerWithContext(HLS_PREVIEW_URL_B, 'item-middle'));
    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(firstHandlerCount);
    });
    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });

    const secondHandlerCount = hlsTest.errorHandlers.length;

    rerender(artworkPlayerWithContext(HLS_PREVIEW_URL_C, 'item-current'));
    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(secondHandlerCount);
    });
    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });

    act(() => {
      staleErrorHandler('error', {
        fatal: true,
        type: 'mediaError',
      });
    });

    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    expect(
      screen.queryByText('The artwork cannot be displayed correctly on this device.')
    ).toBeNull();
  });
});

describe('ArtworkPlayer — stale HLS media-attached after slot reuse', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mediaLoadInstrumentation.calls.length = 0;
    hlsTest.instances.length = 0;
    hlsTest.mediaAttachedHandlers.length = 0;
    hlsTest.errorHandlers.length = 0;
    playSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'pause')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it('ignores stale HLS media-attached readiness after slot reuse', async () => {
    hlsTest.loadSource.mockClear();
    const { rerender } = render(
      artworkPlayerWithContext(HLS_PREVIEW_URL, 'item-old')
    );

    await waitFor(() => {
      expect(hlsTest.mediaAttachedHandlers.length).toBeGreaterThan(0);
    });

    const staleMediaAttached = hlsTest.mediaAttachedHandlers[0];
    const firstHandlerCount = hlsTest.mediaAttachedHandlers.length;

    rerender(artworkPlayerWithContext(HLS_PREVIEW_URL_B, 'item-middle'));
    await waitFor(() => {
      expect(hlsTest.mediaAttachedHandlers.length).toBeGreaterThan(firstHandlerCount);
    });
    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
    });

    const secondHandlerCount = hlsTest.mediaAttachedHandlers.length;

    rerender(artworkPlayerWithContext(HLS_PREVIEW_URL_C, 'item-current'));
    await waitFor(() => {
      expect(hlsTest.mediaAttachedHandlers.length).toBeGreaterThan(secondHandlerCount);
    });

    const loadSourceCount = hlsTest.loadSource.mock.calls.length;

    act(() => {
      staleMediaAttached();
    });

    expect(hlsTest.loadSource.mock.calls.length).toBe(loadSourceCount);
  });
});

describe('ArtworkPlayer — refresh reload tick (progressive video)', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mediaLoadInstrumentation.calls.length = 0;
    playSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve());
    pauseSpy = vi
      .spyOn(HTMLVideoElement.prototype, 'pause')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    cleanup();
  });

  it('re-runs progressive video media load when reload tick fires at the same preview URL', async () => {
    let performReload: (() => void) | null = null;

    renderWithContext(
      <ArtworkPlayer
        previewURL={VIDEO_PREVIEW_URL}
        artworkPreviewMIMEType="video/mp4"
        displayPreferences={defaultDP1DisplayPreference}
        onRegisterArtworkReload={fn => {
          performReload = fn;
        }}
      />
    );

    await waitFor(() => {
      expect(performReload).not.toBeNull();
    });

    await waitFor(() => {
      const videoLoads = mediaLoadInstrumentation.calls.filter(
        entry => entry.mediaType === 'video'
      );
      expect(videoLoads.length).toBeGreaterThanOrEqual(1);
    });

    const countBeforeReload = mediaLoadInstrumentation.calls.filter(
      entry => entry.mediaType === 'video'
    ).length;

    act(() => {
      performReload?.();
    });

    await waitFor(() => {
      const videoLoads = mediaLoadInstrumentation.calls.filter(
        entry => entry.mediaType === 'video'
      );
      expect(videoLoads.length).toBeGreaterThan(countBeforeReload);
    });

    const lastVideo = mediaLoadInstrumentation.calls.filter(
      entry => entry.mediaType === 'video'
    ).at(-1);
    expect(lastVideo?.url).toBe(VIDEO_PREVIEW_URL);
  });
});
