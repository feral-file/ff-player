import { AppContext } from '@/context/AppContext';
import { RenderStatus } from '@/models';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

interface HlsErrorData {
  fatal?: boolean;
  type?: string;
  details?: string;
}

const hlsTest = vi.hoisted(() => ({
  instances: [] as {
    recoverMediaError: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    stopLoad: ReturnType<typeof vi.fn>;
    mediaAttachedHandler?: (
      event: string,
      data: { fatal?: boolean }
    ) => void;
    fragBufferedHandler?: () => void;
  }[],
  errorHandlers: [] as ((event: string, data: HlsErrorData) => void)[],
}));

vi.mock('hls.js', () => {
  const Events = {
    MEDIA_ATTACHED: 'hlsMediaAttached',
    ERROR: 'error',
    FRAG_BUFFERED: 'hlsFragBuffered',
  };
  // Mirrors hls.js 1.5's own string values so a test firing a literal type or
  // detail exercises the same branch the real library would.
  const ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
    KEY_SYSTEM_ERROR: 'keySystemError',
    MUX_ERROR: 'muxError',
    OTHER_ERROR: 'otherError',
  };
  const ErrorDetails = {
    BUFFER_NUDGE_ON_STALL: 'bufferNudgeOnStall',
    BUFFER_STALLED_ERROR: 'bufferStalledError',
    INTERNAL_EXCEPTION: 'internalException',
    REMUX_ALLOC_ERROR: 'remuxAllocError',
    KEY_SYSTEM_DESTROY_MEDIA_KEYS_ERROR: 'keySystemDestroyMediaKeysError',
  };

  class MockHls {
    static Events = Events;

    static ErrorTypes = ErrorTypes;

    static ErrorDetails = ErrorDetails;

    static isSupported(): boolean {
      return true;
    }

    destroy = vi.fn();

    stopLoad = vi.fn();

    loadSource = vi.fn();

    recoverMediaError = vi.fn();

    mediaAttachedHandler?: (
      event: string,
      data: { fatal?: boolean }
    ) => void;

    fragBufferedHandler?: () => void;

    constructor() {
      hlsTest.instances.push(this);
    }

    attachMedia(): void {
      return undefined;
    }

    on(
      event: string,
      handler: (() => void) | ((event: string, data: HlsErrorData) => void)
    ): void {
      if (event === Events.MEDIA_ATTACHED) {
        this.mediaAttachedHandler = handler as (
          event: string,
          data: { fatal?: boolean }
        ) => void;
      }
      if (event === Events.ERROR) {
        hlsTest.errorHandlers.push(
          handler as (event: string, data: HlsErrorData) => void
        );
      }
      if (event === Events.FRAG_BUFFERED) {
        this.fragBufferedHandler = handler as () => void;
      }
    }
  }

  return {
    __esModule: true,
    default: MockHls,
  };
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

function renderArtworkPlayer(
  itemIdentity = 'hls-error-item',
  onItemCommitted?: (identity: string) => void,
  setPlaybackDegraded?: (degraded: boolean, url?: string) => void
) {
  const value = {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig: {},
      displaySettings: null,
      cursorPositions: null,
      castInfo: null,
      setPlaybackDegraded,
    },
  };
  return (
    <AppContext.Provider value={value as never}>
      <ArtworkPlayer
        previewURL="https://ipfs.io/ipfs/QmTest/stream.m3u8"
        artworkPreviewMIMEType="application/vnd.apple.mpegurl"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={itemIdentity}
        onItemCommitted={onItemCommitted}
      />
    </AppContext.Provider>
  );
}

describe('ArtworkPlayer — non-fatal HLS errors', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
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
    hlsTest.instances.length = 0;
    hlsTest.errorHandlers.length = 0;
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it.each([
    ['otherError', 'internalException'],
    ['muxError', 'remuxAllocError'],
    ['keySystemError', 'keySystemDestroyMediaKeysError'],
  ] as const)(
    'leaves playback alone for a non-fatal %s that hls.js recovers from',
    async (type, details) => {
      render(renderArtworkPlayer());

      await waitFor(() => {
        expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
      });

      const activeHls = hlsTest.instances[0];
      act(() => {
        hlsTest.errorHandlers[0]('error', { fatal: false, type, details });
      });

      // hls.js resolves these itself (worker → inline demuxing, one skipped
      // buffer, EME teardown). Destroying would kill playback it was about to
      // resume, and publishing failed would raise the modal over a live artwork.
      expect(activeHls.destroy).not.toHaveBeenCalled();
      expect(activeHls.recoverMediaError).not.toHaveBeenCalled();
      expect(canvasService.getStatus().renderStatus).not.toBe(
        RenderStatus.failed
      );
      expect(
        screen.queryByText(
          'The artwork cannot be displayed correctly on this device.'
        )
      ).toBeNull();
    }
  );
});

describe('ArtworkPlayer — HLS error handling', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
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
    hlsTest.instances.length = 0;
    hlsTest.errorHandlers.length = 0;
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it('keeps a fatal unknown HLS error terminal', async () => {
    render(renderArtworkPlayer());

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
    });

    const activeHls = hlsTest.instances[0];
    act(() => {
      hlsTest.errorHandlers[0]('error', {
        fatal: true,
        type: 'otherError',
        details: 'internalException',
      });
    });

    expect(activeHls.recoverMediaError).not.toHaveBeenCalled();
    expect(activeHls.destroy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
    });
    expect(
      screen.getByText('The artwork cannot be displayed correctly on this device.')
    ).toBeTruthy();
  });

  it('ignores a stale recoverable HLS stall after identity takeover', async () => {
    const { rerender } = render(renderArtworkPlayer('item-old'));

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
    });

    const staleErrorHandler = hlsTest.errorHandlers[0];
    const staleHls = hlsTest.instances[0];
    const staleHandlerCount = hlsTest.errorHandlers.length;

    rerender(renderArtworkPlayer('item-new'));

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(staleHandlerCount);
    });

    act(() => {
      staleErrorHandler('error', {
        fatal: true,
        type: 'mediaError',
        details: 'bufferNudgeOnStall',
      });
    });

    expect(staleHls.recoverMediaError).not.toHaveBeenCalled();
    expect(canvasService.getStatus().renderStatus).not.toBe(RenderStatus.failed);
  });
});

describe('ArtworkPlayer — current-slot fatal HLS failures', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearHlsTestState();
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
    clearHlsTestState();
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it.each([
    ['networkError', undefined],
    ['mediaError', 'manifestIncompatible'],
  ] as const)(
    'publishes failed for a current-slot fatal HLS %s',
    async (type, details) => {
      const onItemCommitted = vi.fn();
      render(renderArtworkPlayer('hls-fatal-item', onItemCommitted));

      await waitFor(() => {
        expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
      });

      const activeIndex = hlsTest.errorHandlers.length - 1;
      const activeHls = hlsTest.instances[activeIndex];
      act(() => {
        hlsTest.errorHandlers[activeIndex]('error', {
          fatal: true,
          type,
          details,
        });
      });

      // Fatal load failures must tear down HLS and complete the incoming
      // transition claim so the outgoing frame is not left latched forever.
      expect(activeHls.recoverMediaError).not.toHaveBeenCalled();
      expect(activeHls.destroy).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
      });
      expect(
        screen.getByText(
          'The artwork cannot be displayed correctly on this device.'
        )
      ).toBeTruthy();
      await waitFor(() => {
        expect(onItemCommitted).toHaveBeenCalledWith('hls-fatal-item');
      });
    }
  );

});

describe('ArtworkPlayer — fatal HLS recovery signal', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearHlsTestState();
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
    clearHlsTestState();
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it('reports the degraded outcome so reconnect recovery can remount', async () => {
    const setPlaybackDegraded = vi.fn();
    render(
      renderArtworkPlayer('hls-fatal-item', undefined, setPlaybackDegraded)
    );

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
    });

    const activeIndex = hlsTest.errorHandlers.length - 1;
    act(() => {
      hlsTest.errorHandlers[activeIndex]('error', {
        fatal: true,
        type: 'networkError',
      });
    });

    // A fatal HLS failure must raise playbackDegraded like every other failure
    // type, or AppContext's reconnect recovery never remounts the stream.
    await waitFor(() => {
      expect(setPlaybackDegraded).toHaveBeenCalledWith(
        true,
        'https://ipfs.io/ipfs/QmTest/stream.m3u8'
      );
    });
  });

  it('clears the degraded flag once the recovered stream buffers again', async () => {
    const setPlaybackDegraded = vi.fn();
    render(
      renderArtworkPlayer('hls-fatal-item', undefined, setPlaybackDegraded)
    );

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
    });

    const activeIndex = hlsTest.errorHandlers.length - 1;
    const activeHls = hlsTest.instances[activeIndex];
    act(() => {
      hlsTest.errorHandlers[activeIndex]('error', {
        fatal: true,
        type: 'networkError',
      });
    });
    await waitFor(() => {
      expect(setPlaybackDegraded).toHaveBeenCalledWith(
        true,
        'https://ipfs.io/ipfs/QmTest/stream.m3u8'
      );
    });

    // Streaming has no loadeddata success path, so without a FRAG_BUFFERED
    // clear the flag would stay latched through a healthy recovery and the M7
    // budget would remount the recovered stream on the age valve forever.
    act(() => {
      activeHls.fragBufferedHandler?.();
    });
    await waitFor(() => {
      expect(setPlaybackDegraded).toHaveBeenLastCalledWith(
        false,
        'https://ipfs.io/ipfs/QmTest/stream.m3u8'
      );
    });
  });
});

/** Clears shared HLS mock state between describes so length assertions stay stable. */
function clearHlsTestState() {
  hlsTest.instances.length = 0;
  hlsTest.errorHandlers.length = 0;
}

function renderFatalErrorPlayer(
  onRegisterArtworkReload?: (reload: (() => void) | null) => void
) {
  return render(
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
      }
    >
      <ArtworkPlayer
        previewURL="https://example.com/artwork.m3u8"
        artworkPreviewMIMEType="application/vnd.apple.mpegurl"
        displayPreferences={defaultDP1DisplayPreference}
        onRegisterArtworkReload={reload => onRegisterArtworkReload?.(reload)}
      />
    </AppContext.Provider>
  );
}

describe('ArtworkPlayer — HLS fatal errors', () => {
  beforeEach(() => {
    clearHlsTestState();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearHlsTestState();
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it('destroys the HLS instance that emitted a fatal error', async () => {
    renderFatalErrorPlayer();

    await waitFor(() => {
      expect(hlsTest.errorHandlers).toHaveLength(1);
    });
    hlsTest.errorHandlers[0]('error', { fatal: true });

    expect(hlsTest.instances[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps a replacement registered when the previous instance errors late', async () => {
    let reload: (() => void) | null = null;
    renderFatalErrorPlayer(nextReload => {
      reload = nextReload;
    });

    await waitFor(() => {
      expect(hlsTest.errorHandlers).toHaveLength(1);
    });

    act(() => {
      reload?.();
    });
    await waitFor(() => {
      expect(hlsTest.errorHandlers).toHaveLength(2);
    });
    const staleHandler = hlsTest.errorHandlers[1];

    act(() => {
      reload?.();
    });
    await waitFor(() => {
      expect(hlsTest.errorHandlers).toHaveLength(3);
    });
    const replacement = hlsTest.instances[2];

    act(() => {
      staleHandler('error', { fatal: true });
    });
    expect(replacement.destroy).not.toHaveBeenCalled();

    // Complete the transition so slot 1 becomes active, then prepare a new
    // incoming video in slot 0. Its crossfade must stop the active slot's
    // replacement instance through hlsInstancesRef. This is distinguishable
    // from effect cleanup, which only destroys an instance after the fade.
    vi.useFakeTimers();
    act(() => {
      replacement.mediaAttachedHandler?.('hlsMediaAttached', {});
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });

    await act(async () => {
      reload?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hlsTest.instances).toHaveLength(4);
    act(() => {
      hlsTest.instances[3].mediaAttachedHandler?.('hlsMediaAttached', {});
    });

    expect(replacement.stopLoad).toHaveBeenCalledTimes(1);
  });
});
