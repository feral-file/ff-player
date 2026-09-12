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
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';
import { canvasService } from '@/services/CanvasService';
import { Scaling } from '@/models/dp1.model';

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
  sessionKey?: string;
  preference?: Partial<DP1DisplayPreference>;
}): React.ReactElement {
  return (
    <AppContext.Provider value={appContextValue}>
      <ArtworkPlayer
        previewURL={props.previewURL}
        artworkPreviewMIMEType={props.mime}
        itemIdentity={props.itemIdentity}
        sessionKey={props.sessionKey}
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
async function renderCommittedImageA(background: string, sessionKey?: string): Promise<{
  container: HTMLElement;
  rerender: (ui: React.ReactElement) => void;
}> {
  const { container, rerender } = render(
    playerEl({
      previewURL: IMAGE_URL_A,
      mime: 'image/png',
      itemIdentity: 'item-a',
      sessionKey,
      preference: { background },
    })
  );
  await waitFor(() => {
    expect(container.querySelector('img')).toBeTruthy();
  });
  fireAllImageLoads(container);
  await waitFor(() => {
    expect(stageOf(container).style.backgroundColor).toBe('rgb(17, 17, 17)');
    expect(canvasService.getStatus().deviceSettings).toMatchObject({
      background: '#111111',
    });
    expect(canvasService.getStatus().deviceSettings?.showingKey).toBeTypeOf(
      'string'
    );
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

describe('ArtworkPlayer — showing identity', () => {
  it('transitions adjacent same-work slots without carrying session settings', async () => {
    const { container, rerender } = await renderCommittedImageA('#111111', 'slot-0');
    const previousKey = canvasService.getStatus().deviceSettings?.showingKey;
    act(() => {
      expect(canvasService.updateDisplaySettings({
        isSaved: false, showingKey: previousKey, margin: '10%', scaling: Scaling.Fill,
      }).ok).toBe(true);
    });
    await waitFor(() => {
      expect(canvasService.getStatus().deviceSettings?.margin).toBe('10%');
    });
    rerender(playerEl({
      previewURL: IMAGE_URL_A, mime: 'image/png', itemIdentity: 'item-a',
      sessionKey: 'slot-1', preference: { background: '#111111', margin: '3%', scaling: Scaling.Fit },
    }));
    expect(canvasService.getStatus().deviceSettings?.showingKey).toBe(previousKey);
    await waitFor(() => { expect(container.querySelectorAll('img')).toHaveLength(2); });
    expect(canvasService.getStatus().deviceSettings?.margin).toBe('10%');
    fireAllImageLoads(container);
    await waitFor(() => {
      const current = canvasService.getStatus().deviceSettings;
      expect(current?.showingKey).not.toBe(previousKey);
      expect(current).toMatchObject({ margin: '3%', scaling: Scaling.Fit });
    }, { timeout: TRANSITION_WAIT_MS });
  });

});

describe('ArtworkPlayer — background latch across item advance', () => {
  it('withholds composition until the first image commits', async () => {
    const { container } = render(
      playerEl({
        previewURL: IMAGE_URL_A,
        mime: 'image/png',
        itemIdentity: 'item-a',
        preference: { background: '#111111', margin: '10%' },
      })
    );
    await waitFor(() => { expect(container.querySelector('img')).toBeTruthy(); });
    const pending = canvasService.getStatus().deviceSettings;
    expect(pending?.showingKey).toBeUndefined();
    expect(pending?.compositionRevision).toBeUndefined();
    expect(pending?.margin).toBeUndefined();
    fireAllImageLoads(container);
    await waitFor(() => {
      expect(canvasService.getStatus().deviceSettings?.showingKey).toBeTypeOf(
        'string'
      );
    });
  });

  it('keeps the outgoing item background until the transition commits', async () => {
    const { container, rerender } = await renderCommittedImageA('#111111');
    const initialShowing = canvasService.getStatus().deviceSettings?.showingKey;

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
    expect(canvasService.getStatus().deviceSettings?.showingKey).toBe(
      initialShowing
    );
    expect(
      canvasService.updateDisplaySettings({
        isSaved: false,
        showingKey: initialShowing,
        background: '#ffffff',
      }).ok
    ).toBe(false);

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
    expect(canvasService.getStatus().deviceSettings).toMatchObject({
      background: '#222222',
    });
    expect(canvasService.getStatus().deviceSettings?.showingKey).not.toBe(
      initialShowing
    );
    // A delayed request for A must not land on B after the transition either.
    expect(
      canvasService.updateDisplaySettings({
        isSaved: false,
        showingKey: initialShowing,
        background: '#ffffff',
      }).ok
    ).toBe(false);
    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(1);
    });
  });
});

describe('ArtworkPlayer — composition acceptance ordering', () => {
  it('commits one field before accepting the next field', async () => {
    await renderCommittedImageA('#111111');
    const showingKey = canvasService.getStatus().deviceSettings?.showingKey;

    let marginReply:
      | ReturnType<typeof canvasService.updateDisplaySettings>
      | undefined;
    flushSync(() => {
      marginReply = canvasService.updateDisplaySettings({
        isSaved: false,
        showingKey,
        margin: '10%',
      });
    });
    const marginStatus = canvasService.getStatus().deviceSettings;
    expect(marginStatus).toMatchObject({ margin: '10%' });
    expect(marginStatus?.compositionRevision).toBeGreaterThan(
      marginReply?.acceptedCompositionRevision ?? Number.MAX_SAFE_INTEGER
    );

    let colorReply:
      | ReturnType<typeof canvasService.updateDisplaySettings>
      | undefined;
    flushSync(() => {
      colorReply = canvasService.updateDisplaySettings({
        isSaved: false,
        showingKey,
        background: '#ffffff',
      });
    });
    expect(colorReply?.acceptedCompositionRevision).toBe(
      marginStatus?.compositionRevision
    );
    const colorStatus = canvasService.getStatus().deviceSettings;
    expect(colorStatus).toMatchObject({
      margin: '10%',
      background: '#ffffff',
    });
    expect(colorStatus?.compositionRevision).toBeGreaterThan(
      colorReply?.acceptedCompositionRevision ?? Number.MAX_SAFE_INTEGER
    );
  });
});

describe('ArtworkPlayer — live settings pass-through', () => {
  it('applies settings changes immediately when no transition is pending', async () => {
    const { container, rerender } = await renderCommittedImageA('#111111');

    const initialRevision =
      canvasService.getStatus().deviceSettings?.compositionRevision;
    const initialShowing = canvasService.getStatus().deviceSettings?.showingKey;
    // Same item, new background (app-driven adjustment): no transition is
    // pending, so the latch must pass it straight through.
    rerender(
      playerEl({
        previewURL: IMAGE_URL_A,
        mime: 'image/png',
        itemIdentity: 'item-a',
        preference: {
          background: '#333333',
          margin: '12%',
          scaling: Scaling.Fill,
        },
      })
    );

    await waitFor(() => {
      expect(stageOf(container).style.backgroundColor).toBe('rgb(51, 51, 51)');
    });
    expect(canvasService.getStatus().deviceSettings).toMatchObject({
      showingKey: initialShowing,
      background: '#333333',
      margin: '12%',
      scaling: Scaling.Fill,
    });
    // A -> B -> A between polls must still change the wire payload, or
    // controld's dedup could suppress another controller's legitimate revert.
    rerender(
      playerEl({
        previewURL: IMAGE_URL_A,
        mime: 'image/png',
        itemIdentity: 'item-a',
        preference: { background: '#111111' },
      })
    );
    await waitFor(() => {
      const report = canvasService.getStatus().deviceSettings;
      expect(report?.background).toBe('#111111');
      expect(report?.compositionRevision).toBeGreaterThan(initialRevision ?? 0);
    });
    cleanup();
    expect(
      canvasService.getStatus().deviceSettings?.showingKey
    ).toBeUndefined();
    expect(canvasService.getStatus().deviceSettings?.margin).toBeUndefined();
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

describe('ArtworkPlayer — failed incoming loads release the settings latch', () => {
  it('a failed incoming image commits and later settings still apply', async () => {
    const { container, rerender } = await renderCommittedImageA('#111111');

    rerender(
      playerEl({
        previewURL: IMAGE_URL_B,
        mime: 'image/png',
        itemIdentity: 'item-b',
        preference: { background: '#222222' },
      })
    );
    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(2);
    });

    // The incoming image fails. The failure must flow through the
    // transition pipeline and commit the failed slot — an abandoned
    // incoming claim would wedge the settings latch and freeze the stage
    // on item A's committed settings. Firing on every img is safe: the
    // active slot's stale failure is dropped by loadedSource's URL guard.
    act(() => {
      container.querySelectorAll('img').forEach(img => {
        img.dispatchEvent(new Event('error'));
      });
    });
    await waitFor(
      () => {
        expect(stageOf(container).style.backgroundColor).toBe(
          'rgb(34, 34, 34)'
        );
      },
      { timeout: TRANSITION_WAIT_MS }
    );

    // Latch released: a live settings change for the on-screen (failed)
    // item applies immediately instead of waiting for the next artwork.
    rerender(
      playerEl({
        previewURL: IMAGE_URL_B,
        mime: 'image/png',
        itemIdentity: 'item-b',
        preference: { background: '#333333' },
      })
    );
    await waitFor(() => {
      expect(stageOf(container).style.backgroundColor).toBe('rgb(51, 51, 51)');
    });
  });

  // No iframe-failure counterpart: React only attaches `load` listeners to
  // iframe/object/embed elements, so their onError props never fire and the
  // iframe wedge is unreachable in practice. handleLoadIframeError still
  // routes through loadedSource defensively, matching the model contract.
});
