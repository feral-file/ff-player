/**
 * Integration coverage for `refreshArtwork`: the reload tick must re-enter the same-URL
 * load path so image / progressive video / HLS setup runs again.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { act, cleanup, render, waitFor } from '@testing-library/react';
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
}));

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

    private mediaAttachedHandler: (() => void) | undefined;

    attachMedia(video: HTMLVideoElement): void {
      void video;
      queueMicrotask(() => {
        this.mediaAttachedHandler?.();
      });
    }

    on(event: string, handler: () => void): void {
      if (event === Events.MEDIA_ATTACHED) {
        this.mediaAttachedHandler = handler;
      }
      if (event === Events.ERROR) {
        /* no-op: tests do not emit errors */
      }
    }

    loadSource = hlsTest.loadSource;

    stopLoad = vi.fn();

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

describe('ArtworkPlayer — refresh reload tick (image)', () => {
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
