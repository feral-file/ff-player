import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const hlsTest = vi.hoisted(() => ({
  instances: [] as { destroy: ReturnType<typeof vi.fn> }[],
  errorHandlers: [] as ((event: string, data: { fatal?: boolean }) => void)[],
}));

vi.mock('hls.js', () => {
  const Events = { MEDIA_ATTACHED: 'mediaAttached', ERROR: 'error' };
  class MockHls {
    static Events = Events;
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    static ErrorDetails = { BUFFER_NUDGE_ON_STALL: 'bufferNudgeOnStall' };
    static isSupported() {return true;}
    destroy = vi.fn();
    attachMedia() {return undefined;}
    loadSource() {return undefined;}
    recoverMediaError() {return undefined;}
    constructor() {hlsTest.instances.push(this);}
    on(event: string, handler: (event: string, data: { fatal?: boolean }) => void) {
      if (event === Events.ERROR) {hlsTest.errorHandlers.push(handler);}
    }
  }
  return { __esModule: true, default: MockHls };
});

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

afterEach(() => {
  hlsTest.instances.length = 0;
  hlsTest.errorHandlers.length = 0;
  cleanup();
});

describe('ArtworkPlayer — HLS fatal errors', () => {
  it('destroys the HLS instance that emitted a fatal error', async () => {
    render(
      <AppContext.Provider value={{ context: {
        isInitialized: true, isOnline: true, appRemoteConfig: {},
        displaySettings: null, cursorPositions: null, castInfo: null,
      } } as never}>
        <ArtworkPlayer
          previewURL="https://example.com/artwork.m3u8"
          artworkPreviewMIMEType="application/vnd.apple.mpegurl"
          displayPreferences={defaultDP1DisplayPreference}
        />
      </AppContext.Provider>
    );

    await waitFor(() => { expect(hlsTest.errorHandlers).toHaveLength(1); });
    hlsTest.errorHandlers[0]('error', { fatal: true });

    expect(hlsTest.instances[0].destroy).toHaveBeenCalledTimes(1);
  });
});
