/**
 * mediaHealth contract v1 (feral-file/ffos-user#392): every mount decision
 * the renderer makes lands in `checkStatus.outcomes` with the stage that
 * decided it. These tests drive the real ArtworkPlayer through each error
 * surface and read the ring back through CanvasService, the way controld
 * does, so the wire tokens are pinned end to end.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import type { PlaybackOutcomeEntry } from '@/models/media_health.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';
import { WebGLRecovery } from './useWebGLRecovery';

const loaderState = vi.hoisted(() => ({
  mode: 'fast' as 'fast' | 'fail' | 'fail-once' | 'hang' | 'element-error',
  elements: [] as (HTMLImageElement | HTMLVideoElement | HTMLAudioElement)[],
}));

vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => ({
      loadMedia: (options: {
        element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
        onLoad?: () => void;
        onError?: (error: Error) => void;
      }) => {
        loaderState.elements.push(options.element);
        if (loaderState.mode === 'fast') {
          options.onLoad?.();
        } else if (loaderState.mode === 'fail') {
          options.onError?.(new Error('load failed'));
        } else if (loaderState.mode === 'fail-once') {
          loaderState.mode = 'fast';
          options.onError?.(new Error('load failed'));
        } else if (loaderState.mode === 'element-error') {
          // The element itself reports, the way Chromium does for a
          // response the decoder rejects: `error` is set before `onerror`.
          Object.defineProperty(options.element, 'error', {
            configurable: true,
            value: { code: 3 },
          });
          options.element.onerror?.(new Event('error'));
        }
        return undefined;
      },
      cleanup: () => undefined,
    }),
  };
});

const SOURCE = 'https://feralfile.com/test/work.jpg';

function node(props: {
  mimeType?: string;
  previewURL?: string;
  onArtworkExhausted?: (identity: string) => void;
}) {
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
        previewURL={props.previewURL ?? SOURCE}
        artworkPreviewMIMEType={props.mimeType ?? 'image/jpeg'}
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity="work"
        onArtworkExhausted={props.onArtworkExhausted}
      />
    </AppContext.Provider>
  );
}

const entries = (): PlaybackOutcomeEntry[] =>
  canvasService.getStatus().outcomes?.entries ?? [];
const sinceSeq = (seq: number) => entries().filter(entry => entry.seq > seq);
const lastSeq = () => entries().at(-1)?.seq ?? 0;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Fake timers would starve testing-library's waitFor, so poll by advancing the clock. */
async function until(ready: () => boolean) {
  for (let i = 0; i < 100 && !ready(); i += 1) {
    await advance(10);
  }
  expect(ready()).toBe(true);
}

let mark = 0;

function useRingHarness() {
  beforeEach(() => {
    vi.useFakeTimers();
    loaderState.mode = 'fast';
    loaderState.elements = [];
    mark = lastSeq();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('no network in test'))
    );
  });

  afterEach(() => {
    cleanup();
    canvasService.setCastInfo(null, false);
    canvasService.setRenderStatus(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}

describe('ArtworkPlayer play-outcome ring: success and the retry budget', () => {
  useRingHarness();

  it('reports a ready mount as ok with the renderer and the mount-to-ready time', async () => {
    render(node({}));
    await until(() => sinceSeq(mark).some(entry => entry.stage === 'ready'));
    const ok = sinceSeq(mark).find(entry => entry.stage === 'ready');
    expect(ok).toMatchObject({
      kind: 'ok',
      source: SOURCE,
      mediaType: 'image',
      attempt: 1,
    });
    expect(ok?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(ok?.code).toBeUndefined();
  });

  it('names the attempt that recovered: a retry success is ok at attempt 2', async () => {
    loaderState.mode = 'fail-once';
    render(node({}));
    await advance(0);
    await advance(3000);
    await until(() => sinceSeq(mark).some(entry => entry.stage === 'ready'));
    expect(
      sinceSeq(mark).map(entry => [entry.kind, entry.stage, entry.attempt])
    ).toEqual([
      ['fail', 'load', 1],
      ['ok', 'ready', 2],
    ]);
  });

  it('charges one load failure per attempt, then reports exhaustion and advances', async () => {
    loaderState.mode = 'fail';
    const exhausted = vi.fn();
    render(node({ onArtworkExhausted: exhausted }));
    await advance(0);
    await advance(3000);
    await advance(3000);
    await advance(0);

    expect(exhausted).toHaveBeenCalledWith('work');
    const fails = sinceSeq(mark).filter(entry => entry.kind === 'fail');
    expect(fails.map(entry => [entry.stage, entry.code, entry.attempt])).toEqual([
      ['load', 'image', 1],
      ['load', 'image', 2],
      ['load', 'image', 3],
      ['exhausted', '3', 3],
    ]);
    expect(fails.every(entry => entry.source === SOURCE)).toBe(true);
    expect(fails.every(entry => entry.mediaType === 'image')).toBe(true);
  });

  it('reports a stalled load through the watchdog with its deadline', async () => {
    loaderState.mode = 'hang';
    render(node({}));
    await advance(0);
    await advance(15000);
    expect(sinceSeq(mark)[0]).toMatchObject({
      kind: 'fail',
      stage: 'watchdog',
      code: '15s',
      attempt: 1,
    });
  });

});

describe('ArtworkPlayer play-outcome ring: decode, detect, and GPU stages', () => {
  useRingHarness();

  it('reads MediaError.code off a media element as the decode stage', async () => {
    loaderState.mode = 'element-error';
    render(node({ mimeType: 'video/mp4', previewURL: SOURCE }));
    await until(() => sinceSeq(mark).length > 0);
    expect(sinceSeq(mark)[0]).toMatchObject({
      kind: 'fail',
      stage: 'decode',
      code: 'decode',
      mediaType: 'video',
      attempt: 1,
    });
  });

  it('records a non-2xx content-type probe as detect with the HTTP status, and still plays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null },
      })
    );
    render(node({ mimeType: '' }));
    await until(() => sinceSeq(mark).some(entry => entry.stage === 'ready'));
    const stages = sinceSeq(mark).map(entry => [entry.kind, entry.stage, entry.code]);
    expect(stages[0]).toEqual(['fail', 'detect', '404']);
    expect(stages.at(-1)?.slice(0, 2)).toEqual(['ok', 'ready']);
  });

  it('records a lost GPU context as the device-local webgl stage', async () => {
    const available = vi
      .spyOn(WebGLRecovery.prototype, 'available')
      .mockReturnValue(false);
    render(node({ mimeType: 'text/html', previewURL: 'https://art.test/gl' }));
    await advance(0);
    const frame = document.querySelector('iframe');
    if (!frame) {
      throw new Error('no iframe mounted');
    }
    await act(async () => {
      frame.dispatchEvent(new Event('load'));
      await Promise.resolve();
    });
    expect(sinceSeq(mark)[0]).toMatchObject({
      kind: 'fail',
      stage: 'webgl',
      code: 'context_lost',
      mediaType: 'iframe',
      source: 'https://art.test/gl',
    });
    available.mockRestore();
  });
});
