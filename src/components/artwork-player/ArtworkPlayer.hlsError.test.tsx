import { AppContext } from '@/context/AppContext';
import { RenderStatus } from '@/models';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const hlsTest = vi.hoisted(() => ({
  instances: [] as {
    recoverMediaError: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }[],
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

    attachMedia(): void {
      return undefined;
    }

    on(
      event: string,
      handler: (() => void) | ((event: string, data: HlsErrorData) => void)
    ): void {
      if (event === Events.ERROR) {
        hlsTest.errorHandlers.push(
          handler as (event: string, data: HlsErrorData) => void
        );
      }
    }

    loadSource = vi.fn();

    destroy = vi.fn();

    recoverMediaError = vi.fn();
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

function renderArtworkPlayer(itemIdentity = 'hls-error-item') {
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
  return (
    <AppContext.Provider value={value as never}>
      <ArtworkPlayer
        previewURL="https://ipfs.io/ipfs/QmTest/stream.m3u8"
        artworkPreviewMIMEType="application/vnd.apple.mpegurl"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={itemIdentity}
      />
    </AppContext.Provider>
  );
}

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
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
  });

  it('keeps unknown HLS errors terminal even when they are non-fatal', async () => {
    render(renderArtworkPlayer());

    await waitFor(() => {
      expect(hlsTest.errorHandlers.length).toBeGreaterThan(0);
    });

    const activeHls = hlsTest.instances[0];
    act(() => {
      hlsTest.errorHandlers[0]('error', {
        fatal: false,
        type: 'otherError',
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
