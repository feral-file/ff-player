/**
 * Regression coverage for the `isOnline` playback-gating effect.
 *
 * Bug: the effect used to force-pause *every* `<video>` slot whenever
 * `context.isOnline` went false, regardless of whether that slot's media
 * actually depended on a live connection. During real offline playback,
 * `feral-controld`'s offline-cache replay serves progressive/local video
 * bytes locally (via CDP Fetch interception or its local static blob
 * server) with no WAN dependency at all, so those videos would freeze like
 * a still image the instant connectivity dropped even though playback
 * could continue uninterrupted from already-buffered/local bytes.
 *
 * Fix: only `isStreaming` layers (HLS/live, which must keep fetching new
 * segments from the network to progress) are gated by `isOnline`.
 * Progressive/local video (`isStreaming: false`) keeps playing based on the
 * existing visibility/target-slot rules alone.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const PROGRESSIVE_VIDEO_URL = 'https://feralfile.com/test/cached-progressive.mp4';
const HLS_VIDEO_URL = 'https://feralfile.com/test/live.m3u8';
const ITEM_A = 'item-a';

interface RenderOpts {
  previewURL: string;
  mimeType: string;
  isOnline: boolean;
}

function buildContextValue(isOnline: boolean): unknown {
  return {
    context: {
      isInitialized: true,
      isOnline,
      appRemoteConfig: {},
      displaySettings: null,
      cursorPositions: null,
      castInfo: null,
    },
  };
}

function artworkPlayerNode(opts: RenderOpts): React.ReactElement {
  return (
    <AppContext.Provider value={buildContextValue(opts.isOnline) as never}>
      <ArtworkPlayer
        previewURL={opts.previewURL}
        artworkPreviewMIMEType={opts.mimeType}
        displayPreferences={{ ...defaultDP1DisplayPreference, loop: false }}
        itemIdentity={ITEM_A}
        onSourceEnded={() => undefined}
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

// Streaming (HLS) slots never set `<video src>` directly — playback is fed
// through Hls.js/MediaSource attachment instead — so unlike the progressive
// case there is no URL to match against; we just wait for the sole slot to
// mount.
async function findSoleVideo(container: HTMLElement): Promise<HTMLVideoElement> {
  return await waitFor(() => {
    const videos = Array.from(container.querySelectorAll('video'));
    if (videos.length !== 1) {
      throw new Error(
        `expected exactly one <video>, found ${String(videos.length)}`
      );
    }
    return videos[0];
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
});

describe('ArtworkPlayer — isOnline connectivity gating', () => {
  it('does not pause a cached progressive video when isOnline flips to false', async () => {
    const { container, rerender } = render(
      artworkPlayerNode({
        previewURL: PROGRESSIVE_VIDEO_URL,
        mimeType: 'video/mp4',
        isOnline: true,
      })
    );

    await findVideoForURL(container, PROGRESSIVE_VIDEO_URL);
    pauseSpy.mockClear();

    rerender(
      artworkPlayerNode({
        previewURL: PROGRESSIVE_VIDEO_URL,
        mimeType: 'video/mp4',
        isOnline: false,
      })
    );

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it('pauses a live HLS stream when isOnline flips to false', async () => {
    const { container, rerender } = render(
      artworkPlayerNode({
        previewURL: HLS_VIDEO_URL,
        mimeType: 'application/vnd.apple.mpegurl',
        isOnline: true,
      })
    );

    await findSoleVideo(container);
    pauseSpy.mockClear();

    rerender(
      artworkPlayerNode({
        previewURL: HLS_VIDEO_URL,
        mimeType: 'application/vnd.apple.mpegurl',
        isOnline: false,
      })
    );

    expect(pauseSpy).toHaveBeenCalled();
  });
});
