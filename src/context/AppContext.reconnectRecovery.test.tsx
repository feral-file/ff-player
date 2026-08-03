/**
 * Reconnect-recovery suite for AppContext, split from AppContext.test.tsx
 * (max-lines-per-function gate — the M7 damping tests below need fake
 * timers and several backoff-window assertions each).
 *
 * An offline boot restores the persisted playlist but every remote asset
 * fetch behind it is single-attempt, so the wall goes black and nothing
 * ever retried once Wi-Fi came back. ArtworkPlayer reports the failed load
 * through context; AppContext turns the next online notification into one
 * refresh — bounded by the M7 damping budget (§4.4 of the cross-repo
 * recovery design): at most 3 attempts per degraded URL, gated by a
 * 15s→60s→240s backoff, reset on a URL change, a genuine online edge, a
 * 60s settle, or 10 minutes of age.
 */
import { AppProvider, useAppContext } from '@/context/AppContext';
import { CastInfo } from '@/models';
import { CustomEventName } from '@/models/custom_event';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  axiosGet,
  canvasServiceMocks,
  deviceManager,
  useNetworkMangerMock,
} = vi.hoisted(() => {
  const deviceManager = {
    getDeviceDisplaySettings: vi.fn().mockResolvedValue(null),
    getItem: vi.fn().mockResolvedValue('true'),
    removeItem: vi.fn().mockResolvedValue(undefined),
    getBootPlaylist: vi.fn(),
    getCastInfo: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    setDeviceDisplaySettings: vi.fn().mockResolvedValue(undefined),
    setDeviceInfo: vi.fn().mockResolvedValue(undefined),
  };
  return {
    axiosGet: vi.fn(),
    canvasServiceMocks: {
      castPlaylistByURL: vi.fn<
        (playlistURL: string, shouldAbort?: () => boolean) => Promise<boolean>
      >(() => Promise.resolve(true)),
      completeBootCastHydration: vi.fn(),
      getCastInfo: vi.fn<() => CastInfo | null>(() => null),
      setCastInfo: vi.fn<(castInfo: CastInfo | null, notify?: boolean) => void>(),
      requestArtworkRefresh: vi.fn<() => boolean>(() => true),
      wasHaltedDuringBootHydration: vi.fn<() => boolean>(() => false),
      didHydrationHaltClearCast: vi.fn<() => boolean>(() => false),
    },
    deviceManager,
    // Reconfigurable per test (default false, matching the daemon's
    // best-effort semantics documented in DEVICE_LOCAL_PLAYER.md): the M7
    // Layer-2 "true online edge" budget reset needs a REAL isOnline
    // transition, not just another online notification (onlineSignal).
    useNetworkMangerMock: vi.fn<() => boolean>(() => false),
  };
});

vi.mock('axios', () => ({
  default: {
    get: axiosGet,
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/services/custom-hooks/useNetworkManager', () => ({
  default: useNetworkMangerMock,
}));

vi.mock('@/services/custom-hooks/useDeviceRotation', () => ({
  default: vi.fn(() => ({ screenRatio: 1 })),
}));

vi.mock('@/services/custom-hooks/useCastInfo', () => ({
  default: vi.fn(() => ({ castInfo: null, setCastInfo: vi.fn() })),
}));

vi.mock('@/services/custom-hooks/useDeviceSettings', () => ({
  useDeviceSettings: vi.fn(() => ({
    displaySettings: null,
    setDisplaySettings: vi.fn(),
  })),
}));

vi.mock('@/services/custom-hooks/useCursorPositions', () => ({
  default: vi.fn(() => ({ cursorPositions: null })),
}));

vi.mock('next/navigation', () => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return { useRouter: () => router };
});

vi.mock('@/services/cdp-handler/CDPRequestHandler', () => ({
  CDPRequestHandler: {
    getInstance: vi.fn(() => ({ cleanup: vi.fn(), initialize: vi.fn() })),
  },
}));

vi.mock('@/services/CanvasService', () => ({
  canvasService: {
    castPlaylistByURL: canvasServiceMocks.castPlaylistByURL,
    completeBootCastHydration: canvasServiceMocks.completeBootCastHydration,
    getCastInfo: canvasServiceMocks.getCastInfo,
    setCastInfo: canvasServiceMocks.setCastInfo,
    requestArtworkRefresh: canvasServiceMocks.requestArtworkRefresh,
    wasHaltedDuringBootHydration: canvasServiceMocks.wasHaltedDuringBootHydration,
    didHydrationHaltClearCast: canvasServiceMocks.didHydrationHaltClearCast,
  },
}));

vi.mock('@/utils/DeviceManager', () => ({
  default: deviceManager,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  useNetworkMangerMock.mockImplementation(() => false);
  deviceManager.getItem.mockResolvedValue('true');
  deviceManager.getCastInfo.mockResolvedValue(null);
  deviceManager.getDeviceDisplaySettings.mockResolvedValue(null);
  deviceManager.removeItem.mockResolvedValue(undefined);
  deviceManager.setItem.mockResolvedValue(undefined);
  deviceManager.setDeviceDisplaySettings.mockResolvedValue(undefined);
  deviceManager.setDeviceInfo.mockResolvedValue(undefined);
  canvasServiceMocks.castPlaylistByURL.mockImplementation(() =>
    Promise.resolve(true)
  );
  canvasServiceMocks.getCastInfo.mockImplementation(() => null);
  canvasServiceMocks.requestArtworkRefresh.mockImplementation(() => true);
  canvasServiceMocks.wasHaltedDuringBootHydration.mockImplementation(
    () => false
  );
  canvasServiceMocks.didHydrationHaltClearCast.mockImplementation(() => false);
});

/**
 * Mounts the provider and exposes the context's degraded-playback setter the
 * way ArtworkPlayer uses it, so these tests can drive the real signal
 * instead of reaching into provider internals.
 */
function renderWithDegradedProbe(): {
  setPlaybackDegraded: (degraded: boolean, url?: string) => void;
} {
  let setter: ((degraded: boolean, url?: string) => void) | undefined;
  const Probe = () => {
    setter = useAppContext().context.setPlaybackDegraded;
    return <div data-testid="app-ready" />;
  };
  render(
    <AppProvider>
      <Probe />
    </AppProvider>
  );
  return {
    setPlaybackDegraded: (degraded: boolean, url?: string) => {
      act(() => {
        setter?.(degraded, url);
      });
    },
  };
}

const bootProbe = () => {
  vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
  axiosGet.mockResolvedValueOnce({
    data: {
      duration: 1000,
      defaultPlaylistURL: 'https://example.com/default-playlist',
    },
  });
  vi.useFakeTimers();
  return renderWithDegradedProbe();
};

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const notifyOnline = () => {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(CustomEventName.ConnectivityChange, {
        detail: { isOnline: true },
      })
    );
  });
};

describe('AppContext reconnect recovery', () => {
  it('refreshes as soon as the artwork reports a failed load', async () => {
    // Covers the ordering where connectivity returned first and the fetch
    // only gave up seconds later: on a single-item playlist there is no
    // playlist advance to retry it, so the degraded edge has to be a trigger
    // in its own right or the wall stays black indefinitely. The FIRST
    // attempt for a fresh budget always fires immediately, with no backoff
    // wait.
    const probe = bootProbe();
    await flush();

    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');

    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh again on an online notification before the backoff elapses', async () => {
    const probe = bootProbe();
    await flush();

    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    notifyOnline();
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes again once the 15s backoff elapses and connectivity notifies again', async () => {
    const probe = bootProbe();
    await flush();

    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    await flush(15_000);
    notifyOnline();
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not refresh when playback is healthy', async () => {
    bootProbe();
    await flush();

    notifyOnline();

    expect(canvasServiceMocks.requestArtworkRefresh).not.toHaveBeenCalled();
  });

  it('does not loop while the same artwork keeps failing', async () => {
    // The refresh re-mounts the SAME previewURL, so a repeat failure finds
    // the flag already set and ArtworkPlayer writes no new context state
    // (React bails the re-render on an unchanged boolean), so the effect
    // never re-runs for these repeats.
    const probe = bootProbe();
    await flush();

    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');
    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');
    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');

    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);
  });

  it('stops refreshing once the artwork loads successfully', async () => {
    const probe = bootProbe();
    await flush();

    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    probe.setPlaybackDegraded(false);
    notifyOnline();

    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('AppContext reconnect recovery — M7 budget cap and resets', () => {
  it('caps refreshes at 3 attempts per degraded URL, even past every backoff window', async () => {
    const probe = bootProbe();
    await flush();
    const url = 'https://example.com/dead-link.jpg';

    probe.setPlaybackDegraded(true, url); // attempt 1, immediate
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    await flush(15_000);
    notifyOnline(); // attempt 2
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);

    await flush(60_000);
    notifyOnline(); // attempt 3 — budget exhausted after this
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(3);

    await flush(240_000);
    notifyOnline(); // capped: no 4th attempt
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(3);
  });

  it('grants a fresh budget to a different URL becoming degraded', async () => {
    const probe = bootProbe();
    await flush();

    // Exhaust the budget for the first URL (3 attempts, one per backoff
    // window, matching the cap test above).
    probe.setPlaybackDegraded(true, 'https://example.com/a.jpg');
    await flush(15_000);
    notifyOnline();
    await flush(60_000);
    notifyOnline();
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(3);

    // A real playlist advance always clears through `false` first (the
    // item-change cleanup effect in ArtworkPlayer) before the new artwork
    // can raise the flag again — React bails a same-value true→true update,
    // which is exactly what "does not loop" above pins, so the transition
    // has to be simulated here too.
    probe.setPlaybackDegraded(false);
    // A different URL degrading — even immediately, no backoff wait — must
    // not be blocked by the first URL's exhausted budget.
    probe.setPlaybackDegraded(true, 'https://example.com/b.jpg');
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(4);
  });

  it('grants a fresh budget immediately on a genuine online edge (isOnline false→true)', async () => {
    // useNetworkMangerMock defaults to a constant `false`; this test flips
    // it mid-run to exercise the one reset condition the other tests in
    // this describe cannot — a REAL isOnline transition, not just another
    // online notification (onlineSignal), which the "before backoff
    // elapses" test above already shows does nothing on its own.
    const probe = bootProbe();
    await flush();
    const url = 'https://example.com/dead-link.jpg';

    probe.setPlaybackDegraded(true, url); // attempt 1, immediate
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    // Still well inside the 15s backoff, and isOnline stays false: dropped.
    notifyOnline();
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    // A genuine edge resets the budget AND the backoff gate together (a
    // stale backoff computed against the old episode must not gate the new
    // one's first attempt), so this notification fires despite being well
    // inside the 15s window a same-episode notification would be dropped in.
    useNetworkMangerMock.mockImplementation(() => true);
    notifyOnline();
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);
  });
});

describe('AppContext reconnect recovery — B1: backoff is the primary re-entry trigger', () => {
  // These pin the fix for the blocker: the budget effect only ran on
  // onlineSignal/playbackDegraded/isOnline changes, so once a run exhausted
  // the budget or landed inside a backoff window, nothing re-entered it
  // again unless one of those dependencies happened to change — which is not
  // guaranteed (a single-item playlist has no advance, a flapping link can
  // stop flapping, and a same-URL repeat failure after a refresh never
  // toggles playbackDegraded again — notePlaybackOutcome's own dedupe drops
  // it before context ever sees it). Every test below deliberately calls
  // `notifyOnline()` / flips `isOnline` NOWHERE — recovery must happen from
  // the armed setTimeout alone.

  it('re-enters via the backoff timer alone once the 15s window elapses', async () => {
    const probe = bootProbe();
    await flush();

    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    await flush(15_000);
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);
  });

  it('keeps re-entering via the timer through every backoff step (15s, 60s)', async () => {
    const probe = bootProbe();
    await flush();

    probe.setPlaybackDegraded(true, 'https://example.com/art.jpg');
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    await flush(15_000);
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);

    await flush(60_000);
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(3);
  });

  it('recovers past budget exhaustion via the age timer alone, with no further edge', async () => {
    const probe = bootProbe();
    await flush();
    const url = 'https://example.com/dead-link.jpg';

    probe.setPlaybackDegraded(true, url); // attempt 1 @ t=0
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    await flush(15_000); // attempt 2 @ t=15s, via the timer
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);

    await flush(60_000); // attempt 3 @ t=75s, via the timer — budget exhausted
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(3);

    // The exhausted budget's own 240s backoff step would only find itself
    // still exhausted — no attempt yet, but the timer must still be armed
    // (for the age valve) rather than dying here.
    await flush(240_000); // t=315s
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(3);

    // Remaining time to the 10-minute age valve, measured from attempt 1's
    // budget start (t=0): 600s - 315s already elapsed.
    await flush(600_000 - 315_000); // t=600s
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(4);
  });

  it('resets on a 60s settle and grants an immediate retry for the same URL', async () => {
    const probe = bootProbe();
    await flush();
    const url = 'https://example.com/art.jpg';

    probe.setPlaybackDegraded(true, url); // attempt 1, immediate
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    // Recovered and stayed up for the full 60s settle window.
    probe.setPlaybackDegraded(false);
    await flush(60_000);

    // Same URL degrades again: a settled clear grants a fresh budget, so
    // this must NOT be backoff-gated even though it is the "same episode"
    // by URL.
    probe.setPlaybackDegraded(true, url);
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not treat a brief flicker (< 60s) as settled — the stale backoff still gates the retry, then the timer completes it', async () => {
    const probe = bootProbe();
    await flush();
    const url = 'https://example.com/art.jpg';

    probe.setPlaybackDegraded(true, url); // attempt 1 @ t=0, immediate
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    // Recovers, but only for 5s — well under the 60s settle window — then
    // fails again at t=8s, still inside attempt 1's 15s backoff window.
    probe.setPlaybackDegraded(false);
    await flush(3_000);
    await flush(5_000);
    probe.setPlaybackDegraded(true, url);
    // Not settled (5s < 60s), not a different URL, not aged: the stale
    // backoff from attempt 1 still gates this — no immediate 2nd attempt.
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    // The timer armed by that last (non-refreshing) run completes the
    // ORIGINAL 15s-from-attempt-1 backoff on its own, with no further edge.
    await flush(7_000); // t=15s
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);
  });

  it('resets on 10 minutes of continuous age even without ever settling', async () => {
    const probe = bootProbe();
    await flush();
    const url = 'https://example.com/dead-link.jpg';

    probe.setPlaybackDegraded(true, url); // attempt 1 @ t=0
    await flush(15_000); // attempt 2 @ t=15s
    await flush(60_000); // attempt 3 @ t=75s — exhausted
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(3);

    await flush(600_000 - 75_000); // t=600s — age valve resets the budget
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(4);

    // The reset budget's own fresh backoff (15s from t=600s) still applies
    // and is itself timer-driven — proving this is a real reset, not a
    // one-off past-exhaustion nudge.
    await flush(15_000); // t=615s
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(5);
  });
});
