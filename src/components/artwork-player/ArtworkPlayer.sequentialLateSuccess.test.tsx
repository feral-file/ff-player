/**
 * Regression for run-reviewer bot-round-3 pass-3 F1: a late success that
 * recovers a watchdog-failed INCOMING slot mid-playlist-transition (not the
 * first-load-of-the-player-instance case `ArtworkPlayer.failureRetrySkip
 * .test.tsx` already covers) can double-fire `onItemPlayed` for the sequential
 * (isEmbeddedHeavy) transition type. That type defers its own
 * onItemCommitted/onItemPlayed pair into a setTimeout rather than firing them
 * synchronously at failure time the way the first-load and crossfade paths
 * do, so the late-success recovery's own immediate onItemPlayed call and that
 * timeout's later, unconditional one both land for the same showing.
 */
import { AppContext } from '@/context/AppContext';
import { RenderStatus } from '@/models';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

const ITEM_A_URL = 'https://feralfile.com/test/sequential-a/';
const ITEM_A_IDENTITY = 'tezos:mainnet:fa2:KT1seqA:1';
const ITEM_B_URL = 'https://feralfile.com/test/sequential-b/';
const ITEM_B_IDENTITY = 'tezos:mainnet:fa2:KT1seqB:1';

function buildContextValue(): unknown {
  return {
    context: {
      isInitialized: true,
      isOnline: true,
      appRemoteConfig: {},
      displaySettings: null,
      cursorPositions: null,
      castInfo: null,
    },
  };
}

function iframePlayerNode(opts: {
  previewURL: string;
  itemIdentity: string;
  onItemPlayed: (itemIdentity: string) => void;
}): React.ReactElement {
  return (
    <AppContext.Provider value={buildContextValue() as never}>
      <ArtworkPlayer
        previewURL={opts.previewURL}
        artworkPreviewMIMEType="text/html"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={opts.itemIdentity}
        onItemPlayed={opts.onItemPlayed}
      />
    </AppContext.Provider>
  );
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

async function advanceTimersBy(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function findIframeForURL(
  container: HTMLElement,
  url: string
): Promise<HTMLIFrameElement> {
  return await waitFor(() => {
    const frames = Array.from(container.querySelectorAll('iframe'));
    const match = frames.find(f => f.getAttribute('src') === url);
    if (!match) {
      throw new Error(`iframe for ${url} was not rendered`);
    }
    return match;
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ArtworkPlayer — a late success recovering an incoming slot mid-sequential-transition', () => {
  it('fires onItemPlayed exactly once, not once from the recovery and once from the deferred transition commit', async () => {
    ensureWebGLConstructors();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as RenderingContext
    );

    const onItemPlayed = vi.fn();
    const { container, rerender } = render(
      iframePlayerNode({
        previewURL: ITEM_A_URL,
        itemIdentity: ITEM_A_IDENTITY,
        onItemPlayed,
      })
    );

    // Item A loads and becomes the active slot (first-load path, synchronous
    // — no race to isolate here).
    const iframeA = await findIframeForURL(container, ITEM_A_URL);
    await act(async () => {
      iframeA.dispatchEvent(new Event('load'));
      await Promise.resolve();
    });
    expect(onItemPlayed).toHaveBeenCalledTimes(1);
    expect(onItemPlayed).toHaveBeenCalledWith(ITEM_A_IDENTITY);
    onItemPlayed.mockClear();

    // Fake timers must be active BEFORE item B mounts: setupMediaForSlot's
    // effect arms the stuck-load watchdog with a real setTimeout the instant
    // the mount effect runs, and advanceTimersBy can only fast-forward a
    // timer that fake timers already own.
    vi.useFakeTimers();

    // Advance to item B — both items are iframe/HTML, so isEmbeddedHeavy is
    // true for both and this transition takes the "sequential" branch, which
    // (unlike crossfade/first-load) defers its own onItemCommitted/
    // onItemPlayed pair into a setTimeout rather than firing them
    // synchronously at failure time.
    act(() => {
      rerender(
        iframePlayerNode({
          previewURL: ITEM_B_URL,
          itemIdentity: ITEM_B_IDENTITY,
          onItemPlayed,
        })
      );
    });
    // Preview-type detection resolves asynchronously; flush that microtask
    // queue under fake timers before looking for the new iframe. Not
    // waitFor: its polling uses a real setTimeout, which never fires once
    // fake timers are active and nothing advances it.
    await advanceTimersBy(0);
    const framesAfterRerender = container.querySelectorAll('iframe');
    const iframeB = Array.from(framesAfterRerender).find(
      f => f.getAttribute('src') === ITEM_B_URL
    );
    if (!iframeB) {
      throw new Error('iframe for item B was not rendered');
    }

    // Item B's load stalls past the embedded-heavy watchdog bound — commits
    // a failure and schedules the sequential transition's deferred commit.
    await advanceTimersBy(45000);
    expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.failed);
    expect(onItemPlayed).not.toHaveBeenCalled();

    // The real load succeeds inside the FADE_IN_OUT_DURATION_MS (650ms)
    // window before that deferred commit fires — the late-success recovery
    // path in loadedSource fires onItemPlayed immediately.
    act(() => {
      iframeB.dispatchEvent(new Event('load'));
    });
    expect(onItemPlayed).toHaveBeenCalledTimes(1);
    expect(onItemPlayed).toHaveBeenCalledWith(ITEM_B_IDENTITY);

    // The already-scheduled deferred transition commit fires next — it must
    // not call onItemPlayed a second time for the same showing.
    await advanceTimersBy(650);
    expect(onItemPlayed).toHaveBeenCalledTimes(1);
  });
});
