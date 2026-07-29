/**
 * Coverage for the degraded-playback signal ArtworkPlayer reports up to
 * AppContext.
 *
 * The trap this pins down: every failure path deliberately commits its slot
 * through `loadedSource` (abandoning the incoming claim wedges the
 * visual-settings latch), so `loadedSource` fires for successes AND failures
 * alike and cannot be used to tell them apart. The flag therefore has to be
 * recorded at the individual error and success sites, and it must not get
 * stuck on once the player moves on to another artwork.
 */
import { AppContext } from '@/context/AppContext';
import { defaultDP1DisplayPreference } from '@/models/dp1.model';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArtworkPlayer from './ArtworkPlayer';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Trusted origin (KNOWN_ORIGINS) + explicit MIME: the loader assigns
// `img.src` directly with no HEAD probe and no blob fetch, so the only
// load/error events are the ones these tests dispatch.
const IMAGE_A = 'https://feralfile.com/test/degraded-a.jpg';
const IMAGE_B = 'https://feralfile.com/test/degraded-b.jpg';

function playerNode(
  previewURL: string,
  setPlaybackDegraded: (degraded: boolean) => void,
  itemIdentity: string = previewURL,
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
        artworkPreviewMIMEType="image/jpeg"
        displayPreferences={defaultDP1DisplayPreference}
        itemIdentity={itemIdentity}
        onRegisterArtworkReload={onRegisterArtworkReload}
      />
    </AppContext.Provider>
  );
}

async function findImage(container: HTMLElement): Promise<HTMLImageElement> {
  return await waitFor(() => {
    const img = container.querySelector('img');
    if (!img?.src) {
      throw new Error('image slot has not been given a source yet');
    }
    return img;
  });
}

/** Dispatches a media event and flushes the decode microtask behind it. */
async function fireMedia(el: HTMLElement, type: 'load' | 'error') {
  await act(async () => {
    el.dispatchEvent(new Event(type));
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ArtworkPlayer — degraded playback signal', () => {
  it('flags a failed asset load for the current artwork', async () => {
    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(IMAGE_A, setPlaybackDegraded));

    await fireMedia(await findImage(container), 'error');

    expect(setPlaybackDegraded).toHaveBeenCalledWith(true);
  });

  it('clears the flag when the same artwork later loads', async () => {
    // This is the reconnect-recovery sequence: the refresh re-mounts the same
    // URL, so nothing else clears the flag — only a genuine success does.
    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(IMAGE_A, setPlaybackDegraded));

    const img = await findImage(container);
    await fireMedia(img, 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true);

    await fireMedia(img, 'load');

    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(false);
  });

  it('does not report anything for an artwork that simply loads', async () => {
    // Cheapness contract: a healthy player must never touch context state.
    const setPlaybackDegraded = vi.fn();
    const { container } = render(playerNode(IMAGE_A, setPlaybackDegraded));

    await fireMedia(await findImage(container), 'load');

    expect(setPlaybackDegraded).not.toHaveBeenCalled();
  });

  it('clears the flag when the playlist moves to a different artwork', async () => {
    // A previous item's failure must not hold the offline backdrop over an
    // artwork that is loading fine.
    const setPlaybackDegraded = vi.fn();
    const { container, rerender } = render(
      playerNode(IMAGE_A, setPlaybackDegraded)
    );

    await fireMedia(await findImage(container), 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true);

    await act(async () => {
      rerender(playerNode(IMAGE_B, setPlaybackDegraded));
      await Promise.resolve();
    });

    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(false);
  });

  it('keeps the flag across a same-item reload, so a retry that fails again stays degraded', async () => {
    // The reconnect-recovery refresh re-mounts the SAME item (reload tick
    // changes, identity and URL do not). Clearing on that remount would turn
    // the one-nudge recovery into an unbounded refresh loop: every clear
    // re-creates the degraded edge AppContext listens for. Only a real
    // success or a different item may clear.
    const setPlaybackDegraded = vi.fn();
    let reload: (() => void) | null = null;
    const { container } = render(
      playerNode(IMAGE_A, setPlaybackDegraded, IMAGE_A, cb => {
        reload = cb;
      })
    );

    await fireMedia(await findImage(container), 'error');
    expect(setPlaybackDegraded).toHaveBeenCalledTimes(1);
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true);

    await act(async () => {
      reload?.();
      await Promise.resolve();
    });

    // The remount reported nothing: no clear, and the repeat failure below
    // finds the flag already set, so no new context write either.
    await fireMedia(await findImage(container), 'error');
    expect(setPlaybackDegraded).toHaveBeenCalledTimes(1);
  });

  it('clears the flag when the playlist advances to a same-URL item under a new identity', async () => {
    // Adjacent playlist items may share a URL; the slot pipeline treats the
    // identity change as a real transition, so the previous item's failure
    // must not leak into the next item — it would hold the backdrop up and
    // swallow the fresh degraded edge reconnect recovery listens for.
    const setPlaybackDegraded = vi.fn();
    const { container, rerender } = render(
      playerNode(IMAGE_A, setPlaybackDegraded, 'item-1')
    );

    await fireMedia(await findImage(container), 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true);

    await act(async () => {
      rerender(playerNode(IMAGE_A, setPlaybackDegraded, 'item-2'));
      await Promise.resolve();
    });

    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(false);
  });

  it('clears the flag when the player unmounts', async () => {
    // Otherwise a route change away from playback (sleep mode) would strand
    // the offline backdrop on screen.
    const setPlaybackDegraded = vi.fn();
    const { container, unmount } = render(
      playerNode(IMAGE_A, setPlaybackDegraded)
    );

    await fireMedia(await findImage(container), 'error');
    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(true);

    act(() => {
      unmount();
    });

    expect(setPlaybackDegraded).toHaveBeenLastCalledWith(false);
  });
});
