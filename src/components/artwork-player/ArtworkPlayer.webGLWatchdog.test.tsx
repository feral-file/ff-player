import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { RenderStatus } from '@/models';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import ArtworkPlayer from './ArtworkPlayer';
import { WebGLRecovery } from './useWebGLRecovery';

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({
    context: {
      isOnline: true,
      appRemoteConfig: {},
      displaySettings: null,
      cursorPositions: null,
      deviceRotation: { viewMode: 'landscape' },
    },
  }),
}));
vi.mock('@/services/custom-hooks/useArtworkSettings', () => ({
  useArtworkSettings: (displaySettings: unknown) => ({ displaySettings }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(WebGLRecovery.prototype, 'available').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  canvasService.setCastInfo(null, false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Exercise the real GPU-loss listener, probe interval, and keyed iframe remount. */
async function reloadAfterGPULoss(exhausted = vi.fn()) {
  const listeners = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
  const mounted = render(
    <ArtworkPlayer
      previewURL="https://art.test/webgl"
      itemIdentity="html"
      artworkPreviewMIMEType="text/html"
      displayPreferences={defaultDP1DisplayPreference}
      onArtworkExhausted={exhausted}
    />
  );
  await advance(0);
  const original = mounted.container.querySelector('iframe');
  if (!original) {
    throw new Error('No initial iframe');
  }
  await act(async () => {
    fireEvent.load(original);
    await Promise.resolve();
  });
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
  // Let the original mount's watchdog expire while the work is healthy.
  await advance(50000);
  const listener = listeners.mock.calls.find(
    call => call[0] === 'webglcontextlost'
  )?.[1];
  if (typeof listener !== 'function') {
    throw new Error('No GPU-loss listener');
  }
  act(() => {
    listener(new Event('webglcontextlost', { cancelable: true }));
  });
  await advance(5000);
  await advance(2000);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
  expect(mounted.container.querySelector('iframe')).not.toBe(original);
  return { ...mounted, exhausted };
}

it('bounds a stalled GPU recovery reload and reaches the ordinary exhaustion callback', async () => {
  const errors = vi.spyOn(console, 'error');
  const mounted = await reloadAfterGPULoss();
  await advance(44999);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
  await advance(1);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
  for (let attempt = 0; attempt < 2; attempt++) {
    await advance(3000);
    await advance(45000);
  }
  expect(mounted.exhausted).toHaveBeenCalledExactlyOnceWith('html');
  expect(
    errors.mock.calls.some(call => String(call[0]).includes('same key'))
  ).toBe(false);
});

it('does not fail a recovered iframe when its fresh watchdog deadline passes', async () => {
  const mounted = await reloadAfterGPULoss();
  const frame = mounted.container.querySelector('iframe');
  if (!frame) {
    throw new Error('No recovery iframe');
  }
  await act(async () => {
    fireEvent.load(frame);
    await Promise.resolve();
  });
  await advance(45000);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
  expect(mounted.exhausted).not.toHaveBeenCalled();
});

it('cancels the reloaded slot watchdog on unmount', async () => {
  const mounted = await reloadAfterGPULoss();
  mounted.unmount();
  await advance(45000);
  expect(canvasService.getStatus().renderStatus).toBeUndefined();
  expect(mounted.exhausted).not.toHaveBeenCalled();
});
