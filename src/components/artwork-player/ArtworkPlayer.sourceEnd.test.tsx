/**
 * Coverage for the real `<video>` / `<audio>` `ended` event path through
 * ArtworkPlayer to the `onSourceEnded` callback. These tests exercise the
 * gate that decides whether a slot's `ended` event represents the current
 * playlist item — important because a strict activeSlot check drops events
 * fired during the 650ms cross-fade before activeSlot commits, which is
 * exactly the case end-of-stream advance is meant to support for short
 * clips. The gate uses `slot.previewURL === previewURLRef.current` instead.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const VIDEO_URL_A = 'https://feralfile.com/test/aeye-1.mp4';
const VIDEO_URL_B = 'https://feralfile.com/test/aeye-2.mp4';

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

function renderArtworkPlayer(
  previewURL: string,
  onSourceEnded: (previewURL: string) => void
): ReturnType<typeof render> {
  return render(
    <AppContext.Provider value={buildContextValue() as never}>
      <ArtworkPlayer
        previewURL={previewURL}
        artworkPreviewMIMEType="video/mp4"
        displayPreferences={{ ...defaultDP1DisplayPreference, loop: false }}
        onSourceEnded={onSourceEnded}
      />
    </AppContext.Provider>
  );
}

function rerenderArtworkPlayer(
  rerender: ReturnType<typeof render>['rerender'],
  previewURL: string,
  onSourceEnded: (previewURL: string) => void
): void {
  rerender(
    <AppContext.Provider value={buildContextValue() as never}>
      <ArtworkPlayer
        previewURL={previewURL}
        artworkPreviewMIMEType="video/mp4"
        displayPreferences={{ ...defaultDP1DisplayPreference, loop: false }}
        onSourceEnded={onSourceEnded}
      />
    </AppContext.Provider>
  );
}

async function findVideoForURL(
  container: HTMLElement,
  url: string
): Promise<HTMLVideoElement> {
  return await waitFor(() => {
    const videos = Array.from(container.querySelectorAll('video'));
    const match = videos.find(v => v.src === url);
    if (!match) {
      throw new Error(
        `no <video> with src=${url} found yet (have: ${videos
          .map(v => v.src)
          .join(', ')})`
      );
    }
    return match;
  });
}

let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

function installVideoSpies(): void {
  playSpy = vi
    .spyOn(HTMLVideoElement.prototype, 'play')
    .mockImplementation(() => Promise.resolve());
  pauseSpy = vi
    .spyOn(HTMLVideoElement.prototype, 'pause')
    .mockImplementation(() => undefined);
}

function restoreVideoSpies(): void {
  playSpy.mockRestore();
  pauseSpy.mockRestore();
  cleanup();
}

describe('ArtworkPlayer — onSourceEnded on the active slot', () => {
  beforeEach(() => {
    installVideoSpies();
  });

  afterEach(() => {
    restoreVideoSpies();
  });

  it('fires onSourceEnded when the active slot video ends', async () => {
    const onSourceEnded = vi.fn();
    const { container } = renderArtworkPlayer(VIDEO_URL_A, onSourceEnded);

    const video = await findVideoForURL(container, VIDEO_URL_A);

    act(() => {
      video.dispatchEvent(new Event('ended'));
    });

    expect(onSourceEnded).toHaveBeenCalledTimes(1);
    expect(onSourceEnded).toHaveBeenCalledWith(VIDEO_URL_A);
  });
});

describe('ArtworkPlayer — onSourceEnded during cross-fade', () => {
  beforeEach(() => {
    installVideoSpies();
  });

  afterEach(() => {
    restoreVideoSpies();
  });

  it('still fires for the incoming slot before the cross-fade commits', async () => {
    const onSourceEnded = vi.fn();
    const { container, rerender } = renderArtworkPlayer(
      VIDEO_URL_A,
      onSourceEnded
    );

    await findVideoForURL(container, VIDEO_URL_A);

    rerenderArtworkPlayer(rerender, VIDEO_URL_B, onSourceEnded);

    const incoming = await findVideoForURL(container, VIDEO_URL_B);

    // Fire `ended` on the incoming slot. The active-slot commit happens after
    // a 650ms transition timeout; we don't advance timers, so activeSlot is
    // still the outgoing slot. The previewURL gate must still pass because
    // the incoming slot's previewURL matches the current target.
    act(() => {
      incoming.dispatchEvent(new Event('ended'));
    });

    expect(onSourceEnded).toHaveBeenCalledTimes(1);
    expect(onSourceEnded).toHaveBeenCalledWith(VIDEO_URL_B);
  });

  it('does not fire for the outgoing slot after a URL change', async () => {
    const onSourceEnded = vi.fn();
    const { container, rerender } = renderArtworkPlayer(
      VIDEO_URL_A,
      onSourceEnded
    );

    const outgoing = await findVideoForURL(container, VIDEO_URL_A);

    rerenderArtworkPlayer(rerender, VIDEO_URL_B, onSourceEnded);

    await findVideoForURL(container, VIDEO_URL_B);

    // The outgoing slot still hosts VIDEO_URL_A while the cross-fade is
    // pending. A late `ended` event on it must be dropped — its slot's
    // previewURL no longer matches the current target.
    act(() => {
      outgoing.dispatchEvent(new Event('ended'));
    });

    expect(onSourceEnded).not.toHaveBeenCalled();
  });
});
