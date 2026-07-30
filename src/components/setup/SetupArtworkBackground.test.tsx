/**
 * Show-condition matrix for the bundled setup artwork.
 *
 * The layer answers two independent needs — "a setup panel is up and nothing
 * is cast" and "the device is offline and the artwork it should be showing
 * failed to load" — while preserving one hard invariant: a device playing
 * artwork normally must never get this layer painted over it (the OTA
 * `updating` panel raised over live playback is the case that matters).
 * Every combination is pinned here because the condition is a single
 * expression that is easy to "simplify" into breaking one of the three.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand, type CastInfo } from '@/models';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SetupArtworkBackground from './SetupArtworkBackground';

const activeCast = { castCommand: CastCommand.displayPlaylist } as CastInfo;

function renderBackground(opts: {
  panelVisible: boolean;
  hasCast: boolean;
  isOnline: boolean;
  playbackDegraded: boolean;
}): HTMLElement {
  const { container } = render(
    <AppContext.Provider
      value={{
        context: {
          isInitialized: true,
          isOnline: opts.isOnline,
          appRemoteConfig: { defaultPlaylistURL: '' },
          castInfo: opts.hasCast ? activeCast : null,
          displaySettings: null,
          cursorPositions: null,
          playbackDegraded: opts.playbackDegraded,
        },
      }}>
      <SetupArtworkBackground panelVisible={opts.panelVisible} />
    </AppContext.Provider>
  );
  return container;
}

interface ShowCase {
  panelVisible: boolean;
  hasCast: boolean;
  isOnline: boolean;
  playbackDegraded: boolean;
  shown: boolean;
}

const showMatrix: ShowCase[] = [
  // No panel, no cast: only the offline-degraded branch can raise it.
  { panelVisible: false, hasCast: false, isOnline: true, playbackDegraded: false, shown: false },
  { panelVisible: false, hasCast: false, isOnline: true, playbackDegraded: true, shown: false },
  { panelVisible: false, hasCast: false, isOnline: false, playbackDegraded: false, shown: false },
  { panelVisible: false, hasCast: false, isOnline: false, playbackDegraded: true, shown: true },
  // No panel, cast active: the field bug — a claimed device that booted
  // offline restores its playlist but can fetch nothing, so the wall is
  // black until this layer covers it.
  { panelVisible: false, hasCast: true, isOnline: true, playbackDegraded: false, shown: false },
  { panelVisible: false, hasCast: true, isOnline: true, playbackDegraded: true, shown: false },
  { panelVisible: false, hasCast: true, isOnline: false, playbackDegraded: false, shown: false },
  { panelVisible: false, hasCast: true, isOnline: false, playbackDegraded: true, shown: true },
  // Panel visible, no cast: the original setup-flow behavior, unchanged.
  { panelVisible: true, hasCast: false, isOnline: true, playbackDegraded: false, shown: true },
  { panelVisible: true, hasCast: false, isOnline: true, playbackDegraded: true, shown: true },
  { panelVisible: true, hasCast: false, isOnline: false, playbackDegraded: false, shown: true },
  { panelVisible: true, hasCast: false, isOnline: false, playbackDegraded: true, shown: true },
  // Panel visible, cast active: healthy playback keeps the wall, and so does
  // an artwork that failed while ONLINE — that is a broken asset or an
  // unsupported format, which the player's own error modal explains. Only
  // the offline case gets the backdrop behind the panel, which is what makes
  // a re-provision QR readable after a sustained outage.
  { panelVisible: true, hasCast: true, isOnline: true, playbackDegraded: false, shown: false },
  { panelVisible: true, hasCast: true, isOnline: true, playbackDegraded: true, shown: false },
  { panelVisible: true, hasCast: true, isOnline: false, playbackDegraded: false, shown: false },
  { panelVisible: true, hasCast: true, isOnline: false, playbackDegraded: true, shown: true },
];

describe('SetupArtworkBackground show condition', () => {
  afterEach(() => {
    cleanup();
  });

  it.each(showMatrix)(
    'panel=$panelVisible cast=$hasCast online=$isOnline degraded=$playbackDegraded → shown=$shown',
    (testCase: ShowCase) => {
      const container = renderBackground(testCase);

      expect(container.querySelector('iframe') !== null).toBe(testCase.shown);
    }
  );

  it('never covers a device that is playing artwork normally', () => {
    // Called out separately from the matrix because it is the invariant the
    // layer exists under, not just another row: an OTA `updating` narration
    // must leave the user's artwork visible through the panel scrim.
    const container = renderBackground({
      panelVisible: true,
      hasCast: true,
      isOnline: true,
      playbackDegraded: false,
    });

    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('SetupArtworkBackground browser-level offline evidence', () => {
  afterEach(() => {
    cleanup();
  });

  it('raises the backdrop on the window offline event while isOnline is stuck true', () => {
    // Reload-while-offline: the daemon's edge-triggered push was spent
    // before the reload, so `isOnline` sits at its optimistic seed and the
    // daemon half of the gate is blind. The browser's own level-triggered
    // interface signal (window online/offline) must cover it.
    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: true,
      playbackDegraded: true,
    });
    expect(container.querySelector('iframe')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(container.querySelector('iframe')).not.toBeNull();
  });

  it('does not raise the backdrop for a healthy artwork when the browser goes offline', () => {
    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: true,
      playbackDegraded: false,
    });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('SetupArtworkBackground navigator.onLine initial read', () => {
  afterEach(() => {
    cleanup();
  });

  it('raises the backdrop from the initial navigator.onLine read, with no offline event needed', () => {
    // Reload-while-offline, the harder half of the browser-level-evidence
    // contract: the FIRST render must already see browser-offline via the
    // `browserOnline` state's useState initializer reading navigator.onLine,
    // not only the window 'offline' event a later transition would fire.
    // Every other test in this file drives the browser-offline case via a
    // dispatched event; hardcoding that initializer to `true` (dropping the
    // read) would leave all of them green, so this is the only test that
    // actually exercises the initial read — it must fail against that
    // mutation.
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: true,
      playbackDegraded: true,
    });

    expect(container.querySelector('iframe')).not.toBeNull();
  });

  it('does not raise the backdrop from the initial read when navigator.onLine is true', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);

    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: true,
      playbackDegraded: true,
    });

    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('SetupArtworkBackground offline status chip', () => {
  afterEach(() => {
    cleanup();
  });

  it('labels the bare offline backdrop', () => {
    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: false,
      playbackDegraded: true,
    });

    expect(container.textContent).toContain('No internet connection');
  });

  it('stays silent while a panel is up, since the panel copy owns messaging', () => {
    const container = renderBackground({
      panelVisible: true,
      hasCast: true,
      isOnline: false,
      playbackDegraded: true,
    });

    expect(container.querySelector('iframe')).not.toBeNull();
    expect(container.textContent).not.toContain('No internet connection');
  });

  it('stays silent when the backdrop is up for the ordinary setup flow', () => {
    const container = renderBackground({
      panelVisible: true,
      hasCast: false,
      isOnline: true,
      playbackDegraded: false,
    });

    expect(container.querySelector('iframe')).not.toBeNull();
    expect(container.textContent).not.toContain('No internet connection');
  });
});
