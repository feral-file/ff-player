/**
 * Coverage for the `onItemCommitted` contract (feral-file#3452): the callback
 * must describe what is actually on the wall, so during a transition it may
 * only fire once the incoming slot becomes visible — never at selection time.
 * The delayed-load case is the one that matters: while the incoming media is
 * still loading, the outgoing artwork stays on screen and no commit for the
 * new item may be reported (the tombstone would otherwise label the previous
 * work with the next work's metadata and burn its timed window).
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

const VIDEO_URL_A = 'https://feralfile.com/test/commit-a.mp4';
const VIDEO_URL_B = 'https://feralfile.com/test/commit-b.mp4';
const ITEM_A = 'commit-item-a';
const ITEM_B = 'commit-item-b';

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
  onItemCommitted: (identity: string) => void;
}

function artworkPlayerNode(opts: RenderOpts): React.ReactElement {
  return (
    <AppContext.Provider value={buildContextValue() as never}>
      <ArtworkPlayer
        previewURL={opts.previewURL}
        artworkPreviewMIMEType="video/mp4"
        displayPreferences={{ ...defaultDP1DisplayPreference, loop: false }}
        itemIdentity={opts.itemIdentity}
        onItemCommitted={opts.onItemCommitted}
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
      throw new Error(`no <video> with src=${url} found yet`);
    }
    return match;
  });
}

let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

describe('ArtworkPlayer — onItemCommitted at visible commit', () => {
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
  });

  it('fires for the first artwork once its media is ready', async () => {
    const onItemCommitted = vi.fn();
    const { container } = render(
      artworkPlayerNode({
        previewURL: VIDEO_URL_A,
        itemIdentity: ITEM_A,
        onItemCommitted,
      })
    );

    const video = await findVideoForURL(container, VIDEO_URL_A);
    expect(onItemCommitted).not.toHaveBeenCalled();

    act(() => {
      video.dispatchEvent(new Event('loadeddata'));
    });

    await waitFor(() => {
      expect(onItemCommitted).toHaveBeenCalledWith(ITEM_A);
    });
  });

  it('does not fire for a delayed incoming item until its media is ready', async () => {
    const onItemCommitted = vi.fn();
    const { container, rerender } = render(
      artworkPlayerNode({
        previewURL: VIDEO_URL_A,
        itemIdentity: ITEM_A,
        onItemCommitted,
      })
    );

    const videoA = await findVideoForURL(container, VIDEO_URL_A);
    act(() => {
      videoA.dispatchEvent(new Event('loadeddata'));
    });
    await waitFor(() => {
      expect(onItemCommitted).toHaveBeenCalledWith(ITEM_A);
    });
    onItemCommitted.mockClear();

    // Selection advances to item B, but its media never reports ready:
    // the outgoing artwork is still what the viewer sees, so no commit for
    // B may be reported.
    rerender(
      artworkPlayerNode({
        previewURL: VIDEO_URL_B,
        itemIdentity: ITEM_B,
        onItemCommitted,
      })
    );
    const videoB = await findVideoForURL(container, VIDEO_URL_B);
    expect(onItemCommitted).not.toHaveBeenCalled();

    // Media becomes ready: the cross-fade starts and B is now appearing on
    // the wall — this is the commit moment.
    act(() => {
      videoB.dispatchEvent(new Event('loadeddata'));
    });
    await waitFor(() => {
      expect(onItemCommitted).toHaveBeenCalledWith(ITEM_B);
    });
  });
});
