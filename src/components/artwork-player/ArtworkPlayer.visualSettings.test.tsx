/**
 * Coverage for the latched visual settings contract (doc §9) and the
 * fade-performance fixes (doc §6 destroy deferral, §10 image pre-decode):
 *
 * - background/margin swap only when a transition commits, never at
 *   playlist-advance time while the outgoing artwork is still visible;
 * - settings changes with no transition pending apply immediately;
 * - images decode() before the slot reports ready;
 * - outgoing HLS teardown at fade start is stopLoad-only; destroy runs
 *   after the fade when the outgoing slot layer is removed.
 */
import { AppContext } from '@/context/AppContext';
import {
  DP1DisplayPreference,
  defaultDP1DisplayPreference,
} from '@/models/dp1.model';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const hlsTest = vi.hoisted(() => ({
  stopLoad: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('hls.js', () => {
  class MockHls {
    static Events = { MEDIA_ATTACHED: 'hlsMediaAttached', ERROR: 'error' };

    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
    };

    static ErrorDetails = { BUFFER_NUDGE_ON_STALL: 'bufferNudgeOnStall' };

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
      if (event === 'hlsMediaAttached') {
        this.mediaAttachedHandler = handler;
      }
    }

    loadSource = vi.fn();

    stopLoad = hlsTest.stopLoad;

    destroy = hlsTest.destroy;

    recoverMediaError = vi.fn();
  }

  return { __esModule: true, default: MockHls };
});

/** Trusted origin (KNOWN_ORIGINS) + explicit MIME: src is set directly, no fetch. */
const IMAGE_URL_A = 'https://feralfile.com/test/visual-settings-a.png';
const IMAGE_URL_B = 'https://feralfile.com/test/visual-settings-b.png';
const HLS_URL = 'https://ipfs.io/ipfs/QmTest/visual-settings.m3u8';

/** 650ms fade + commit timeout headroom for waitFor assertions. */
const TRANSITION_WAIT_MS = 3000;

/**
 * jsdom lacks a usable HTMLImageElement.decode; installed on the prototype
 * in beforeEach so the pre-decode gate resolves and falls through to
 * loadedSource. Kept module-scoped so tests can assert on it directly.
 */
const decodeMock = vi.fn(() => Promise.resolve());

const appContextValue = {
  context: {
    isInitialized: true,
    isOnline: true,
    appRemoteConfig: {},
    displaySettings: null,
    cursorPositions: null,
    castInfo: null,
  },
} as never;

/** Player wrapped in the AppContext harness; reused by render AND rerender. */
function playerEl(props: {
  previewURL: string;
  mime: string;
  itemIdentity: string;
  preference?: Partial<DP1DisplayPreference>;
}): React.ReactElement {
  return (
    <AppContext.Provider value={appContextValue}>
      <ArtworkPlayer
        previewURL={props.previewURL}
        artworkPreviewMIMEType={props.mime}
        itemIdentity={props.itemIdentity}
        displayPreferences={{
          ...defaultDP1DisplayPreference,
          ...props.preference,
        }}
      />
    </AppContext.Provider>
  );
}

function stageOf(container: HTMLElement): HTMLElement {
  const stage = container.firstElementChild as HTMLElement | null;
  if (!stage) {
    throw new Error('stage div not rendered');
  }
  return stage;
}

/** Fire `load` on every rendered img; stale slots are dropped by URL guards. */
function fireAllImageLoads(container: HTMLElement): void {
  act(() => {
    container.querySelectorAll('img').forEach(img => {
      img.dispatchEvent(new Event('load'));
    });
  });
}

/** Render item A and wait for its ready-commit (stage shows A's background). */
async function renderCommittedImageA(background: string): Promise<{
  container: HTMLElement;
  rerender: (ui: React.ReactElement) => void;
}> {
  const { container, rerender } = render(
    playerEl({
      previewURL: IMAGE_URL_A,
      mime: 'image/png',
      itemIdentity: 'item-a',
      preference: { background },
    })
  );
  await waitFor(() => {
    expect(container.querySelector('img')).toBeTruthy();
  });
  fireAllImageLoads(container);
  await waitFor(() => {
    expect(stageOf(container).style.backgroundColor).toBe('rgb(17, 17, 17)');
  });
  return { container, rerender };
}

let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  hlsTest.stopLoad.mockClear();
  hlsTest.destroy.mockClear();
  decodeMock.mockClear();
  playSpy = vi
    .spyOn(HTMLVideoElement.prototype, 'play')
    .mockImplementation(() => Promise.resolve());
  pauseSpy = vi
    .spyOn(HTMLVideoElement.prototype, 'pause')
    .mockImplementation(() => undefined);
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    writable: true,
    value: decodeMock,
  });
});

afterEach(() => {
  playSpy.mockRestore();
  pauseSpy.mockRestore();
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  cleanup();
});

describe('ArtworkPlayer — background latch across item advance', () => {
  it('keeps the outgoing item background until the transition commits', async () => {
    const { container, rerender } = await renderCommittedImageA('#111111');

    rerender(
      playerEl({
        previewURL: IMAGE_URL_B,
        mime: 'image/png',
        itemIdentity: 'item-b',
        preference: { background: '#222222' },
      })
    );

    // Incoming slot mounts a second img while item B loads. The stage must
    // still show item A's background for this whole window.
    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(2);
    });
    expect(stageOf(container).style.backgroundColor).toBe('rgb(17, 17, 17)');

    // Item B ready -> crossfade -> commit swaps the stage to B's background.
    fireAllImageLoads(container);
    await waitFor(
      () => {
        expect(stageOf(container).style.backgroundColor).toBe(
          'rgb(34, 34, 34)'
        );
      },
      { timeout: TRANSITION_WAIT_MS }
    );
    // Outgoing slot layer is gone after commit.
    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(1);
    });
  });
});

describe('ArtworkPlayer — live settings pass-through', () => {
  it('applies settings changes immediately when no transition is pending', async () => {
    const { container, rerender } = await renderCommittedImageA('#111111');

    // Same item, new background (app-driven adjustment): no transition is
    // pending, so the latch must pass it straight through.
    rerender(
      playerEl({
        previewURL: IMAGE_URL_A,
        mime: 'image/png',
        itemIdentity: 'item-a',
        preference: { background: '#333333' },
      })
    );

    await waitFor(() => {
      expect(stageOf(container).style.backgroundColor).toBe('rgb(51, 51, 51)');
    });
  });
});

describe('ArtworkPlayer — image pre-decode gate', () => {
  it('awaits image decode() before reporting the slot ready', async () => {
    const { container } = render(
      playerEl({
        previewURL: IMAGE_URL_A,
        mime: 'image/png',
        itemIdentity: 'item-a',
        preference: { background: '#111111' },
      })
    );

    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
    });
    expect(decodeMock).not.toHaveBeenCalled();
    fireAllImageLoads(container);
    await waitFor(() => {
      expect(decodeMock).toHaveBeenCalled();
    });
    // Ready commit still lands (decode resolved -> loadedSource).
    await waitFor(() => {
      expect(stageOf(container).style.backgroundColor).toBe('rgb(17, 17, 17)');
    });
  });
});

describe('ArtworkPlayer — deferred outgoing HLS teardown', () => {
  it('defers destroy to slot removal; stopLoad runs at fade start', async () => {
    const { container, rerender } = render(
      playerEl({
        previewURL: HLS_URL,
        mime: 'application/vnd.apple.mpegurl',
        itemIdentity: 'item-hls',
      })
    );

    // HLS attach -> play -> ready commit for the first item.
    await waitFor(() => {
      expect(container.querySelector('video')).toBeTruthy();
    });
    await waitFor(() => {
      expect(playSpy).toHaveBeenCalled();
    });

    rerender(
      playerEl({
        previewURL: IMAGE_URL_A,
        mime: 'image/png',
        itemIdentity: 'item-a',
      })
    );

    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
    });
    expect(hlsTest.destroy).not.toHaveBeenCalled();

    // Incoming image ready -> fade starts -> outgoing HLS is stopLoad'd but
    // NOT destroyed (destroy in this pre-paint phase is the fade jank).
    fireAllImageLoads(container);
    await waitFor(() => {
      expect(hlsTest.stopLoad).toHaveBeenCalled();
    });
    expect(hlsTest.destroy).not.toHaveBeenCalled();

    // Post-fade commit removes the outgoing slot layer; the streaming
    // effect cleanup owns the destroy.
    await waitFor(
      () => {
        expect(hlsTest.destroy).toHaveBeenCalled();
      },
      { timeout: TRANSITION_WAIT_MS }
    );
    await waitFor(() => {
      expect(container.querySelector('video')).toBeNull();
    });
  });
});
