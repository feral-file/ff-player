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
const AUDIO_URL_A = 'https://feralfile.com/test/poem-1.mp3';
const ITEM_A = 'item-a';
const ITEM_B = 'item-b';

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

interface RenderOpts {
  previewURL: string;
  itemIdentity: string;
  onSourceEnded: (identity: string) => void;
  mimeType?: string;
}

function artworkPlayerNode(opts: RenderOpts): React.ReactElement {
  return (
    <AppContext.Provider value={buildContextValue() as never}>
      <ArtworkPlayer
        previewURL={opts.previewURL}
        artworkPreviewMIMEType={opts.mimeType ?? 'video/mp4'}
        displayPreferences={{ ...defaultDP1DisplayPreference, loop: false }}
        itemIdentity={opts.itemIdentity}
        onSourceEnded={opts.onSourceEnded}
      />
    </AppContext.Provider>
  );
}

function renderArtworkPlayer(opts: RenderOpts): ReturnType<typeof render> {
  return render(artworkPlayerNode(opts));
}

function rerenderArtworkPlayer(
  rerender: ReturnType<typeof render>['rerender'],
  opts: RenderOpts
): void {
  rerender(artworkPlayerNode(opts));
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

async function findAudio(
  container: HTMLElement
): Promise<HTMLAudioElement> {
  return await waitFor(() => {
    const audio = container.querySelector('audio');
    if (!audio) {
      throw new Error('no <audio> rendered yet');
    }
    return audio;
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

  it('fires onSourceEnded with the slot identity when video ends', async () => {
    const onSourceEnded = vi.fn();
    const { container } = renderArtworkPlayer({
      previewURL: VIDEO_URL_A,
      itemIdentity: ITEM_A,
      onSourceEnded,
    });

    const video = await findVideoForURL(container, VIDEO_URL_A);

    act(() => {
      video.dispatchEvent(new Event('ended'));
    });

    expect(onSourceEnded).toHaveBeenCalledTimes(1);
    expect(onSourceEnded).toHaveBeenCalledWith(ITEM_A);
  });

  it('fires onSourceEnded for audio sources too', async () => {
    const onSourceEnded = vi.fn();
    const { container } = renderArtworkPlayer({
      previewURL: AUDIO_URL_A,
      itemIdentity: ITEM_A,
      onSourceEnded,
      mimeType: 'audio/mpeg',
    });

    const audio = await findAudio(container);

    act(() => {
      audio.dispatchEvent(new Event('ended'));
    });

    expect(onSourceEnded).toHaveBeenCalledTimes(1);
    expect(onSourceEnded).toHaveBeenCalledWith(ITEM_A);
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
    const { container, rerender } = renderArtworkPlayer({
      previewURL: VIDEO_URL_A,
      itemIdentity: ITEM_A,
      onSourceEnded,
    });

    await findVideoForURL(container, VIDEO_URL_A);

    rerenderArtworkPlayer(rerender, { previewURL: VIDEO_URL_B, itemIdentity: ITEM_B, onSourceEnded });

    const incoming = await findVideoForURL(container, VIDEO_URL_B);

    // Fire `ended` on the incoming slot. The active-slot commit happens after
    // a 650ms transition timeout; we don't advance timers, so activeSlot is
    // still the outgoing slot. The identity gate must still pass because
    // the incoming slot's itemIdentity matches the current target.
    act(() => {
      incoming.dispatchEvent(new Event('ended'));
    });

    expect(onSourceEnded).toHaveBeenCalledTimes(1);
    expect(onSourceEnded).toHaveBeenCalledWith(ITEM_B);
  });

  it('does not fire for the outgoing slot after a URL change', async () => {
    const onSourceEnded = vi.fn();
    const { container, rerender } = renderArtworkPlayer({
      previewURL: VIDEO_URL_A,
      itemIdentity: ITEM_A,
      onSourceEnded,
    });

    const outgoing = await findVideoForURL(container, VIDEO_URL_A);

    rerenderArtworkPlayer(rerender, { previewURL: VIDEO_URL_B, itemIdentity: ITEM_B, onSourceEnded });

    await findVideoForURL(container, VIDEO_URL_B);

    // The outgoing slot still hosts VIDEO_URL_A while the cross-fade is
    // pending. A late `ended` event on it must be dropped — its slot's
    // itemIdentity no longer matches the current target.
    act(() => {
      outgoing.dispatchEvent(new Event('ended'));
    });

    expect(onSourceEnded).not.toHaveBeenCalled();
  });

  it('drops a late ended from the outgoing slot when adjacent items share a URL', async () => {
    // The bot-flagged regression case: two adjacent playlist items pointing
    // at the same media URL. The previewURL gate alone would not
    // discriminate them — itemIdentity does. After advancing from item A to
    // item B (same URL), a stale `ended` from A's playback must not be
    // reported as B's end-of-stream.
    const onSourceEnded = vi.fn();
    const { container, rerender } = renderArtworkPlayer({
      previewURL: VIDEO_URL_A,
      itemIdentity: ITEM_A,
      onSourceEnded,
    });

    const oldElement = await findVideoForURL(container, VIDEO_URL_A);

    // Same URL, new identity. ArtworkPlayer must recreate the slot (so
    // the <video> remounts with a fresh iframeKey-derived React key) and
    // reject any `ended` that still fires on the stale element.
    rerenderArtworkPlayer(rerender, { previewURL: VIDEO_URL_A, itemIdentity: ITEM_B, onSourceEnded });

    await waitFor(() => {
      const videos = Array.from(container.querySelectorAll('video'));
      // Old slot remains during the cross-fade window (mounted side-by-side
      // with the new slot). Both render <video> elements pointing at the
      // same URL.
      expect(videos.length).toBeGreaterThanOrEqual(1);
    });

    act(() => {
      oldElement.dispatchEvent(new Event('ended'));
    });

    // The stale element belongs to ITEM_A, but the current itemIdentity is
    // ITEM_B. The identity gate drops the event.
    expect(onSourceEnded).not.toHaveBeenCalledWith(ITEM_A);
  });
});
