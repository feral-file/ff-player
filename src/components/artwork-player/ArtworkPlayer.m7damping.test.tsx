/**
 * M7 damping, Layer 1 (cross-repo recovery design §4.4): once a video/audio
 * mount has reported a playback FAILURE, a later `loadeddata` success on
 * that SAME mount must not clear the degraded flag. Browsers can fire a
 * stray `loadeddata` after `error` on a partially-buffered element, and
 * without this latch that flip-flop re-raises the flag on the very next
 * real error, re-triggering AppContext's reconnect-recovery refresh on
 * every flap. The latch is per-MOUNT, not permanent: a fresh mount (a new
 * slot, e.g. after a reload) gets a clean chance.
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

// Trusted origin (KNOWN_ORIGINS): the loader assigns el.src directly with no
// blob fetch, so the only load/error/loadeddata events are the ones these
// tests dispatch — matches ArtworkPlayer.sourceEnd.test.tsx's setup.
const VIDEO_URL = 'https://feralfile.com/test/m7-video.mp4';
const AUDIO_URL = 'https://feralfile.com/test/m7-audio.mp3';

function playerNode(
  previewURL: string,
  setPlaybackDegraded: (degraded: boolean, url?: string) => void,
  mimeType: string,
  onRegisterArtworkReload?: (reload: (() => void) | null) => void
): React.ReactElement {
  return (
    <AppContext.Provider
      value={
        {
          context: {
            isInitialized: true,
            isOnline: true,
            appRemoteConfig: {},
            displaySettings: null,
            cursorPositions: null,
            castInfo: null,
            playbackDegraded: false,
            setPlaybackDegraded,
          },
        } as never
      }>
      <ArtworkPlayer
        previewURL={previewURL}
        artworkPreviewMIMEType={mimeType}
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={previewURL}
        onRegisterArtworkReload={onRegisterArtworkReload}
      />
    </AppContext.Provider>
  );
}

async function findVideo(container: HTMLElement): Promise<HTMLVideoElement> {
  return await waitFor(() => {
    const el = container.querySelector('video');
    if (!el?.src) {
      throw new Error('video slot has not been given a source yet');
    }
    return el;
  });
}

async function findAudio(container: HTMLElement): Promise<HTMLAudioElement> {
  return await waitFor(() => {
    const el = container.querySelector('audio');
    if (!el?.src) {
      throw new Error('audio slot has not been given a source yet');
    }
    return el;
  });
}

async function fireMedia(el: HTMLElement, type: 'error' | 'loadeddata') {
  await act(async () => {
    el.dispatchEvent(new Event(type));
    await Promise.resolve();
  });
}

let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
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
  cleanup();
  vi.clearAllMocks();
});

describe('ArtworkPlayer M7 Layer 1 — video mount damping', () => {
  it('a later loadeddata success on the same mount does not clear a reported failure', async () => {
    const setPlaybackDegraded = vi.fn();
    const { container } = render(
      playerNode(VIDEO_URL, setPlaybackDegraded, 'video/mp4')
    );

    const video = await findVideo(container);
    await fireMedia(video, 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true, VIDEO_URL);

    // Stray success on the SAME element/mount: must not clear.
    await fireMedia(video, 'loadeddata');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true, VIDEO_URL);
    // And no extra context write beyond the one failure report.
    expect(setPlaybackDegraded).toHaveBeenCalledTimes(1);
  });

  it('a fresh mount (post-reload) can still clear on its own success', async () => {
    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(VIDEO_URL, setPlaybackDegraded, 'video/mp4', cb => {
        reload = cb;
      })
    );

    const firstVideo = await findVideo(container);
    await fireMedia(firstVideo, 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true, VIDEO_URL);

    // Reload swaps to a fresh slot/mount (a new <video> element, per
    // ArtworkPlayer's reload contract — it recreates the OTHER slot rather
    // than reusing this one).
    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    const newVideo = await waitFor(() => {
      const videos = Array.from(container.querySelectorAll('video'));
      const fresh = videos.find(v => v !== firstVideo && v.src);
      if (!fresh) {
        throw new Error('reloaded mount has not appeared yet');
      }
      return fresh;
    });
    expect(newVideo).not.toBe(firstVideo);

    // The NEW mount's own success must clear the flag — the latch is
    // per-mount, not permanent.
    await fireMedia(newVideo, 'loadeddata');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(false, VIDEO_URL);
  });

  it('a failure still reports on a mount that already cleared once, after a genuine success', async () => {
    // One-shot only in the success→clear direction: the latch never
    // disables FAILURE reporting, only a success's ability to clear. A
    // fresh mount that genuinely recovers (clears) and later breaks again
    // must still raise the flag on that second failure.
    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(VIDEO_URL, setPlaybackDegraded, 'video/mp4', cb => {
        reload = cb;
      })
    );

    const firstVideo = await findVideo(container);
    await fireMedia(firstVideo, 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true, VIDEO_URL);

    await act(async () => {
      reload?.();
      await Promise.resolve();
    });
    const newVideo = await waitFor(() => {
      const videos = Array.from(container.querySelectorAll('video'));
      const fresh = videos.find(v => v !== firstVideo && v.src);
      if (!fresh) {
        throw new Error('reloaded mount has not appeared yet');
      }
      return fresh;
    });

    // The fresh mount's own success clears the flag (Test above pins this).
    await fireMedia(newVideo, 'loadeddata');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(false, VIDEO_URL);

    // The SAME mount breaking later must still report — the latch is not
    // permanently stuck for this slot once it has cleared once.
    await fireMedia(newVideo, 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true, VIDEO_URL);
  });
});

describe('ArtworkPlayer M7 Layer 1 — audio mount damping', () => {
  it('a later loadeddata success on the same mount does not clear a reported failure', async () => {
    const setPlaybackDegraded = vi.fn();
    const { container } = render(
      playerNode(AUDIO_URL, setPlaybackDegraded, 'audio/mpeg')
    );

    const audio = await findAudio(container);
    await fireMedia(audio, 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true, AUDIO_URL);

    await fireMedia(audio, 'loadeddata');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true, AUDIO_URL);
    expect(setPlaybackDegraded).toHaveBeenCalledTimes(1);
  });
});
