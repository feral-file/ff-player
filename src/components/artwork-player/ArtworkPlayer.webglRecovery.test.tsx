/**
 * Focused coverage for WebGL context-loss recovery: after a successful reload,
 * renderStatus must leave failed and publish ready again.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { RenderStatus } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

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

const HTML_PREVIEW_URL = 'data:text/html,<html><body>ok</body></html>';

function renderHtmlArtwork(): ReturnType<typeof render> {
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
    <AppContext.Provider value={value as never}>
      <ArtworkPlayer
        previewURL={HTML_PREVIEW_URL}
        artworkPreviewMIMEType="text/html"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity="item-html"
      />
    </AppContext.Provider>
  );
}

async function settleReact() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advanceTimersBy(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await Promise.resolve();
  });
}

async function fireIframeLoad(container: HTMLElement) {
  const iframe = container.querySelector('iframe');
  expect(iframe).not.toBeNull();
  if (iframe === null) {
    return;
  }
  await act(async () => {
    iframe.dispatchEvent(new Event('load'));
    await Promise.resolve();
  });
}

function ensureWebGLConstructors() {
  // jsdom lacks WebGL constructors; isWebGLAvailable uses instanceof in its
  // success log and treats a thrown ReferenceError as "unavailable".
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

function captureWebGLLostListener(): {
  getListener: () => ((event: Event) => void) | undefined;
} {
  let lostListener: ((event: Event) => void) | undefined;
  // Capture the listener without relying on Document.createElement (deprecated
  // in this repo's typed DOM surface) or aliasing `this`.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- prototype method saved before spy
  const originalAddEventListener = HTMLCanvasElement.prototype.addEventListener;
  vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener').mockImplementation(
    function (
      this: HTMLCanvasElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) {
      if (type === 'webglcontextlost' && typeof listener === 'function') {
        lostListener = listener;
      }
      originalAddEventListener.call(this, type, listener, options);
    }
  );
  return {
    getListener: () => lostListener,
  };
}

describe('ArtworkPlayer WebGL recovery render status', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ensureWebGLConstructors();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as RenderingContext
    );
  });

  afterEach(() => {
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps an iframe loading after WebGL recovery because its load is unverified', async () => {
    const { getListener } = captureWebGLLostListener();
    const { container } = renderHtmlArtwork();
    await settleReact();
    await fireIframeLoad(container);
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);

    const lostListener = getListener();
    expect(lostListener).toBeTypeOf('function');
    if (lostListener === undefined) {
      return;
    }

    await act(async () => {
      lostListener(new Event('webglcontextlost', { cancelable: true }));
      await Promise.resolve();
    });
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);

    // Recovery polls every 5s, then waits 2s before reloading the active iframe.
    await advanceTimersBy(5000);
    await advanceTimersBy(2000);
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);

    await fireIframeLoad(container);
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
  });
});
