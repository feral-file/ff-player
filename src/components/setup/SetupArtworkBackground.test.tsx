/**
 * Show-condition matrix for the bundled setup artwork.
 *
 * The layer answers two independent needs — "a setup flow is active and no
 * work is saved" and "the device is offline and the artwork it should be
 * showing failed to load" — while preserving one hard invariant: a device
 * playing artwork normally must never get this layer painted over it (the OTA
 * `updating` panel raised over live playback is the case that matters).
 * Every combination is pinned here because the condition is a single
 * expression that is easy to "simplify" into breaking one of the three.
 *
 * `hasCast: true` is a saved work (a playlist with an item), so its degraded
 * backdrop waits out SAVED_WORK_RETRY_GRACE_MS; tests that are about what
 * happens after that call `lapseRetryGrace()`.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand, type CastInfo } from '@/models';
import type { DP1Call } from '@/models/dp1.model';
import { act, cleanup, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SetupArtworkBackground, {
  CONNECTING_GRACE_MS,
  FADE_OUT_MS,
  RECOVERY_HANDOVER_MS,
  SAVED_WORK_RETRY_GRACE_MS,
} from './SetupArtworkBackground';

const savedWork = {
  castCommand: CastCommand.displayPlaylist,
  playlist: { items: [{ id: 'work-1' }] } as unknown as DP1Call,
} as CastInfo;
// What `setLoop` persists on a unit with no artwork: cast state, no work.
const loopOnlyCast = { castCommand: CastCommand.setLoop } as CastInfo;

interface BackgroundOpts {
  panelVisible: boolean;
  setupActive?: boolean;
  cast?: CastInfo;
  hasCast: boolean;
  isOnline: boolean;
  playbackDegraded: boolean;
}

function backgroundNode(opts: BackgroundOpts): React.ReactElement {
  return (
    <AppContext.Provider
      value={{
        context: {
          isInitialized: true,
          isOnline: opts.isOnline,
          appRemoteConfig: { defaultPlaylistURL: '' },
          castInfo: opts.cast ?? (opts.hasCast ? savedWork : null),
          displaySettings: null,
          cursorPositions: null,
          playbackDegraded: opts.playbackDegraded,
        },
      }}>
      <SetupArtworkBackground
        setupActive={opts.setupActive ?? opts.panelVisible}
        panelVisible={opts.panelVisible}
      />
    </AppContext.Provider>
  );
}

function renderBackground(opts: BackgroundOpts): HTMLElement {
  return render(backgroundNode(opts)).container;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function lapseRetryGrace() {
  advance(SAVED_WORK_RETRY_GRACE_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
  // No panel, saved work: the field bug — a claimed device that booted
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
  // Panel visible, saved work: healthy playback keeps the wall, and so does
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
  it.each(showMatrix)(
    'panel=$panelVisible cast=$hasCast online=$isOnline degraded=$playbackDegraded → shown=$shown',
    (testCase: ShowCase) => {
      const container = renderBackground(testCase);
      // The settled state: a saved work's first retry has had its turn.
      lapseRetryGrace();

      expect(container.querySelector('iframe') !== null).toBe(testCase.shown);
    }
  );

  it('never covers a device that is playing artwork normally', () => {
    // Called out separately from the matrix because it is the invariant the
    // layer exists under, not just another row: an OTA `updating` panel
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
    lapseRetryGrace();
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
    lapseRetryGrace();

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
    lapseRetryGrace();

    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('SetupArtworkBackground offline status chip', () => {
  it('labels the bare offline backdrop', () => {
    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: false,
      playbackDegraded: true,
    });
    lapseRetryGrace();

    expect(container.textContent).toContain('No internet connection');
  });

  it('stays silent while a panel is up, since the panel copy owns messaging', () => {
    const container = renderBackground({
      panelVisible: true,
      hasCast: true,
      isOnline: false,
      playbackDegraded: true,
    });
    lapseRetryGrace();

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

describe('SetupArtworkBackground reconnect handover', () => {
  // The field bug this latch exists for: dropping the backdrop on the
  // connectivity edge revealed the still-broken slot underneath (blank, or
  // Chromium's in-iframe net-error page) for the seconds the recovery
  // remount needs. The exit signal is the artwork RECOVERING, not the
  // network returning.
  const offline = { panelVisible: false, hasCast: true, isOnline: false, playbackDegraded: true };
  const reconnected = { ...offline, isOnline: true };
  const recovered = { ...reconnected, playbackDegraded: false };

  it('keeps the backdrop up when connectivity returns while the artwork is still degraded', () => {
    const { container, rerender } = render(backgroundNode(offline));
    lapseRetryGrace();
    expect(container.querySelector('iframe')).not.toBeNull();

    act(() => {
      rerender(backgroundNode(reconnected));
    });

    expect(container.querySelector('iframe')).not.toBeNull();
    // Online again, so an offline claim would be false: the backdrop rides
    // chipless and the chip's disappearance itself signals reconnection.
    expect(container.textContent).not.toContain('No internet connection');
  });

  it('never introduces the backdrop when connectivity returned before it was shown', () => {
    // The hold preserves a backdrop that is on screen. A saved work that
    // fails offline and is back online inside its retry grace never had
    // one, so none may appear while online — not when the grace ends, and
    // not at any point in the handover window after it.
    const { container, rerender } = render(backgroundNode(offline));
    advance(1_000);
    act(() => {
      rerender(backgroundNode(reconnected));
    });

    advance(SAVED_WORK_RETRY_GRACE_MS - 1_000);
    expect(container.innerHTML).toBe('');
    advance(RECOVERY_HANDOVER_MS + FADE_OUT_MS);
    expect(container.innerHTML).toBe('');
  });

  it('exits when the artwork actually recovers, via the normal fade', () => {
    const { container, rerender } = render(backgroundNode(offline));
    lapseRetryGrace();

    act(() => {
      rerender(backgroundNode(reconnected));
    });
    expect(container.querySelector('iframe')).not.toBeNull();

    act(() => {
      rerender(backgroundNode(recovered));
    });
    advance(FADE_OUT_MS);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('yields after RECOVERY_HANDOVER_MS so a permanently-broken-but-online artwork falls through to the player error modal', () => {
    const { container, rerender } = render(backgroundNode(offline));
    lapseRetryGrace();

    act(() => {
      rerender(backgroundNode(reconnected));
    });
    expect(container.querySelector('iframe')).not.toBeNull();

    advance(RECOVERY_HANDOVER_MS);
    advance(FADE_OUT_MS);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('re-arms cleanly: a second offline episode gets a fresh handover, not a spent latch', () => {
    const { container, rerender } = render(backgroundNode(offline));
    lapseRetryGrace();
    expect(container.querySelector('iframe')).not.toBeNull();
    // Episode 1 recovers fully.
    act(() => {
      rerender(backgroundNode(recovered));
    });
    advance(FADE_OUT_MS);
    expect(container.querySelector('iframe')).toBeNull();

    // Episode 2: offline degradation again, then reconnect while degraded.
    act(() => {
      rerender(backgroundNode(offline));
    });
    lapseRetryGrace();
    act(() => {
      rerender(backgroundNode(reconnected));
    });
    expect(container.querySelector('iframe')).not.toBeNull();
  });
});

describe('SetupArtworkBackground chip escalation', () => {
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
    lapseRetryGrace();

    expect(container.textContent).toContain('Connecting to the internet…');
    expect(container.textContent).not.toContain('No internet connection');
  });

  it('escalates to "No internet connection" once the boot-settle window elapses', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const container = renderBackground({
      panelVisible: false,
      hasCast: true,
      isOnline: true,
      playbackDegraded: true,
    });
    lapseRetryGrace();
    expect(container.textContent).toContain('Connecting to the internet…');

    advance(CONNECTING_GRACE_MS - SAVED_WORK_RETRY_GRACE_MS);
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
    lapseRetryGrace();
    expect(container.querySelector('iframe')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(container.textContent).toContain('No internet connection');
    expect(container.textContent).not.toContain('Connecting to the internet…');
  });
});

describe('SetupArtworkBackground during a setup state with no panel', () => {
  const noPanel = { setupActive: true, panelVisible: false };

  it('shows the bundled artwork, without a chip, when nothing is cast', () => {
    const container = renderBackground({
      ...noPanel,
      hasCast: false,
      isOnline: false,
      playbackDegraded: false,
    });
    expect(container.querySelector('iframe')).not.toBeNull();
    expect(container.querySelector('p')).toBeNull();
  });

  it('shows the bundled artwork when the cast state holds no work', () => {
    // `setLoop` on a unit with no artwork leaves cast state with no
    // playlist. Nothing mounts to report degradation, so without the
    // backdrop a narration-only setup state is a black screen.
    const container = renderBackground({
      ...noPanel,
      hasCast: true,
      cast: loopOnlyCast,
      isOnline: true,
      playbackDegraded: false,
    });
    expect(container.querySelector('iframe')).not.toBeNull();
    expect(container.querySelector('p')).toBeNull();
  });

  it('puts nothing over a displaying work', () => {
    const container = renderBackground({
      ...noPanel,
      hasCast: true,
      isOnline: false,
      playbackDegraded: false,
    });
    expect(container.innerHTML).toBe('');
  });
});

describe('SetupArtworkBackground with a saved work that fails offline', () => {
  const failing = {
    panelVisible: false,
    hasCast: true,
    isOnline: false,
    playbackDegraded: true,
  };

  it('shows no bundled artwork and no chip before the first retry has had its turn', () => {
    const { container } = render(backgroundNode(failing));
    expect(container.innerHTML).toBe('');
    advance(SAVED_WORK_RETRY_GRACE_MS - 1);
    expect(container.innerHTML).toBe('');
  });

  it('never shows the bundled artwork when the retry loads the work', () => {
    const { container, rerender } = render(backgroundNode(failing));
    advance(16_000);
    rerender(backgroundNode({ ...failing, playbackDegraded: false }));
    advance(10 * SAVED_WORK_RETRY_GRACE_MS);
    expect(container.innerHTML).toBe('');
  });

  it('shows the bundled artwork and the chip once the retry has failed too', () => {
    // jsdom's navigator.onLine is true, so the chip is past its soft
    // "Connecting…" text; the escalation tests above pin both wordings.
    const { container } = render(backgroundNode(failing));
    lapseRetryGrace();
    expect(container.querySelector('iframe')).not.toBeNull();
    expect(container.querySelector('p')?.textContent).toBe(
      'No internet connection'
    );
  });

  it('waits out the retry during a setup state with no panel too', () => {
    const { container } = render(
      backgroundNode({ ...failing, setupActive: true })
    );
    advance(SAVED_WORK_RETRY_GRACE_MS - 1);
    expect(container.innerHTML).toBe('');
    advance(1);
    expect(container.querySelector('iframe')).not.toBeNull();
  });

  it('shows the bundled artwork at once when the cast state holds no work', () => {
    const { container } = render(
      backgroundNode({ ...failing, cast: loopOnlyCast })
    );
    expect(container.querySelector('iframe')).not.toBeNull();
  });
});
