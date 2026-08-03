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
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SetupArtworkBackground, {
  CONNECTING_GRACE_MS,
  FADE_OUT_MS,
  RECOVERY_HANDOVER_MS,
} from './SetupArtworkBackground';

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

function backgroundNode(opts: {
  panelVisible: boolean;
  hasCast: boolean;
  isOnline: boolean;
  playbackDegraded: boolean;
}): React.ReactElement {
  return (
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
}

describe('SetupArtworkBackground reconnect handover', () => {
  // The field bug this latch exists for: dropping the backdrop on the
  // connectivity edge revealed the still-broken slot underneath (blank, or
  // Chromium's in-iframe net-error page) for the seconds the recovery
  // remount needs. The exit signal is the artwork RECOVERING, not the
  // network returning.
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the backdrop up when connectivity returns while the artwork is still degraded', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      backgroundNode({ panelVisible: false, hasCast: true, isOnline: false, playbackDegraded: true })
    );
    expect(container.querySelector('iframe')).not.toBeNull();

    act(() => {
      rerender(
        backgroundNode({ panelVisible: false, hasCast: true, isOnline: true, playbackDegraded: true })
      );
    });

    expect(container.querySelector('iframe')).not.toBeNull();
    // Online again, so an offline claim would be false: the backdrop rides
    // chipless and the chip's disappearance itself signals reconnection.
    expect(container.textContent).not.toContain('No internet connection');
  });

  it('exits when the artwork actually recovers, via the normal fade', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      backgroundNode({ panelVisible: false, hasCast: true, isOnline: false, playbackDegraded: true })
    );

    act(() => {
      rerender(
        backgroundNode({ panelVisible: false, hasCast: true, isOnline: true, playbackDegraded: true })
      );
    });
    expect(container.querySelector('iframe')).not.toBeNull();

    act(() => {
      rerender(
        backgroundNode({ panelVisible: false, hasCast: true, isOnline: true, playbackDegraded: false })
      );
    });
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS);
    });
    expect(container.querySelector('iframe')).toBeNull();
  });

});

describe('SetupArtworkBackground reconnect handover bounds', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('yields after RECOVERY_HANDOVER_MS so a permanently-broken-but-online artwork falls through to the player error modal', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      backgroundNode({ panelVisible: false, hasCast: true, isOnline: false, playbackDegraded: true })
    );

    act(() => {
      rerender(
        backgroundNode({ panelVisible: false, hasCast: true, isOnline: true, playbackDegraded: true })
      );
    });
    expect(container.querySelector('iframe')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(RECOVERY_HANDOVER_MS);
    });
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS);
    });
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('re-arms cleanly: a second offline episode gets a fresh handover, not a spent latch', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      backgroundNode({ panelVisible: false, hasCast: true, isOnline: false, playbackDegraded: true })
    );
    // Episode 1 recovers fully.
    act(() => {
      rerender(
        backgroundNode({ panelVisible: false, hasCast: true, isOnline: true, playbackDegraded: false })
      );
    });
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS);
    });
    expect(container.querySelector('iframe')).toBeNull();

    // Episode 2: offline degradation again, then reconnect while degraded.
    act(() => {
      rerender(
        backgroundNode({ panelVisible: false, hasCast: true, isOnline: false, playbackDegraded: true })
      );
    });
    act(() => {
      rerender(
        backgroundNode({ panelVisible: false, hasCast: true, isOnline: true, playbackDegraded: true })
      );
    });
    expect(container.querySelector('iframe')).not.toBeNull();
  });
});

describe('SetupArtworkBackground chip escalation', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('reads "Connecting to the internet…" on a boot that has never been online', () => {
    // Cold offline boot: the page paints before Wi-Fi association finishes,
    // so navigator.onLine is false from the very first render. That outage
    // is (so far) a routine connect-in-progress, not a verdict.
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: true,
      playbackDegraded: true,
    });

    expect(container.textContent).toContain('Connecting to the internet…');
    expect(container.textContent).not.toContain('No internet connection');
  });

  it('escalates to "No internet connection" once the boot-settle window elapses', () => {
    vi.useFakeTimers();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: true,
      playbackDegraded: true,
    });
    expect(container.textContent).toContain('Connecting to the internet…');

    act(() => {
      vi.advanceTimersByTime(CONNECTING_GRACE_MS);
    });
    expect(container.textContent).toContain('No internet connection');
    expect(container.textContent).not.toContain('Connecting to the internet…');
  });

  it('shows "No internet connection" immediately when a previously-online device loses the link', () => {
    // jsdom's navigator.onLine defaults to true, so the component mounts
    // having SEEN the browser online — a later outage is real from its
    // first frame and gets no soft-pedaling.
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
    expect(container.textContent).toContain('No internet connection');
    expect(container.textContent).not.toContain('Connecting to the internet…');
  });
});
