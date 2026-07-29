import { AppProvider, useAppContext } from '@/context/AppContext';
import { LocalStorageItem } from '@/constants';
import { CastCommand, type CastInfo } from '@/models';
import { CustomEventName } from '@/models/custom_event';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGet, canvasServiceMocks, deviceManager } =
  vi.hoisted(() => {
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
        // Resolves the new boolean contract: true = playlist fetched AND cast.
        // Typed with the real two-arg signature so tests can read the
        // shouldAbort callback back out of mock.calls.
        castPlaylistByURL: vi.fn<
          (playlistURL: string, shouldAbort?: () => boolean) => Promise<boolean>
        >(() => Promise.resolve(true)),
        completeBootCastHydration: vi.fn(),
        getCastInfo: vi.fn<() => CastInfo | null>(() => null),
        setCastInfo: vi.fn(),
        requestArtworkRefresh: vi.fn<() => boolean>(() => true),
      },
      deviceManager,
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
  default: vi.fn(() => false),
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
  // Stable identity like the real router: a fresh object per render would
  // re-run the fallback-loop effect (router is in its deps) on every render
  // and make attempt counts nondeterministic.
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
  },
}));

vi.mock('@/utils/DeviceManager', () => ({
  default: deviceManager,
}));

afterEach(() => {
  // No vitest globals → RTL never auto-registers its cleanup, so providers
  // from earlier tests stay mounted and their window listeners keep firing.
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

// vitest.config enables restoreMocks, which strips mockResolvedValue / mockImplementation
// from hoisted spies before each test; re-apply defaults here.
beforeEach(() => {
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
});

/**
 * Mounts the provider and exposes the context's degraded-playback setter the
 * way ArtworkPlayer uses it, so the reconnect tests can drive the real
 * signal instead of reaching into provider internals.
 */
function renderWithDegradedProbe(): {
  setPlaybackDegraded: (degraded: boolean) => void;
} {
  let setter: ((degraded: boolean) => void) | undefined;
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
    setPlaybackDegraded: (degraded: boolean) => {
      act(() => {
        setter?.(degraded);
      });
    },
  };
}

describe('AppContext boot recovery', () => {
  it('skips boot playlist restoration after a version update reload', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/default-playlist',
      },
    });

    render(
      <AppProvider>
        <div data-testid="app-ready" />
      </AppProvider>
    );

    await waitFor(() => { expect(screen.getByTestId('app-ready')).toBeTruthy(); });

    await waitFor(() => {
      expect(deviceManager.getItem).toHaveBeenCalledWith(
        LocalStorageItem.versionUpdateReload
      );
      expect(deviceManager.removeItem).toHaveBeenCalledWith(
        LocalStorageItem.versionUpdateReload
      );
      expect(deviceManager.getBootPlaylist).not.toHaveBeenCalled();
    });
  });

  it('retries the fallback playlist on backoff until it casts, then stops', async () => {
    // First-time SoftAP setup boots the kiosk into the player with no
    // connectivity, so the boot fallback fetch fails; the old one-shot
    // behavior left the device with no artwork forever. The loop must retry
    // (backoff or isOnline re-key) and end on the first successful cast.
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/default-playlist',
      },
    });
    canvasServiceMocks.castPlaylistByURL
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    vi.useFakeTimers();
    render(
      <AppProvider>
        <div data-testid="app-ready" />
      </AppProvider>
    );

    // Flush boot promises: config fetch + castInfo miss → first (failing)
    // fallback attempt.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);

    // Initial backoff elapses → second attempt, which succeeds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(2);

    // Success cleared the fallback flag: no further attempts ever fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(2);
  });

});

// Shared boot for the explicit-cast cancellation tests: remote config with a
// default playlist URL, fake timers, and a mounted provider. Keeps each test
// (and the describe callback) inside the max-lines-per-function gate.
const bootWithDefaultPlaylist = () => {
  vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
  axiosGet.mockResolvedValueOnce({
    data: {
      duration: 1000,
      defaultPlaylistURL: 'https://example.com/default-playlist',
    },
  });
  vi.useFakeTimers();
  render(
    <AppProvider>
      <div data-testid="app-ready" />
    </AppProvider>
  );
};

describe('AppContext explicit-cast cancellation', () => {
  it('an explicit cast cancels a pending fallback retry', async () => {
    // A failed attempt leaves the request active with a retry timer armed.
    // If the controller casts real content in that window, the retry must
    // never fire — it would replace the explicit cast with the default
    // playlist.
    canvasServiceMocks.castPlaylistByURL.mockResolvedValueOnce(false);
    bootWithDefaultPlaylist();

    // Boot fallback attempt fails → retry armed on backoff.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);

    // Explicit cast lands (CanvasService announces it) → loop cancelled.
    // Flush the state update first so the effect cleanup clears the armed
    // retry timer, THEN advance time: the real sequence is cast-then-wait,
    // and advancing in the same tick would race the timer against React.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CustomEventName.ExplicitPlaylistCast)
      );
      await vi.advanceTimersByTimeAsync(0);
    });

    // The armed retry and all later backoff windows stay silent.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);
  });

  it('an explicit cast flips the in-flight abort hook before the commit', async () => {
    // The cast commit happens inside castPlaylistByURL after its fetch
    // resolves; AppContext's own `cancelled` check runs only after that, so
    // the loop must hand CanvasService a shouldAbort callback that reflects
    // cancellation while the fetch is still in flight.
    let resolveFirst: ((casted: boolean) => void) | undefined;
    canvasServiceMocks.castPlaylistByURL.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          resolveFirst = resolve;
        })
    );
    bootWithDefaultPlaylist();

    // First attempt hangs with its fetch in flight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);
    const shouldAbort = canvasServiceMocks.castPlaylistByURL.mock.calls[0][1];
    expect(shouldAbort?.()).toBe(false);

    // Explicit cast lands mid-flight: the hook must flip so CanvasService
    // drops the stale cast, and the aborted (false) result must not
    // schedule another retry.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CustomEventName.ExplicitPlaylistCast)
      );
      // Same-task assertion, BEFORE any await lets React flush: the
      // fallback fetch can resolve before React commits the state update
      // and runs the effect cleanup that sets `cancelled`, so the hook must
      // report cancellation synchronously via the event handler's ref.
      expect(shouldAbort?.()).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      resolveFirst?.(false);
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);
  });

  it('a default-playlist push arriving after an explicit cast still casts', async () => {
    // Ordering contract: both signals are synchronous window events, so the
    // command that arrived last wins — explicit-then-default must leave the
    // request active and cast the forced default.
    let resolveSecond: ((casted: boolean) => void) | undefined;
    canvasServiceMocks.castPlaylistByURL
      .mockImplementationOnce(() => Promise.resolve(true))
      .mockImplementationOnce(
        () =>
          new Promise<boolean>(resolve => {
            resolveSecond = resolve;
          })
      );
    bootWithDefaultPlaylist();

    // Boot fallback casts once and settles.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CustomEventName.ExplicitPlaylistCast)
      );
      window.dispatchEvent(
        new CustomEvent(CustomEventName.DisplayDefaultPlaylist)
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(2);

    // Re-arming reset the synchronous cancel ref: the forced default's own
    // in-flight attempt must NOT be aborted by the explicit cast that
    // preceded the push.
    const secondAbort = canvasServiceMocks.castPlaylistByURL.mock.calls[1][1];
    expect(secondAbort?.()).toBe(false);

    await act(async () => {
      resolveSecond?.(true);
      await vi.advanceTimersByTimeAsync(0);
    });
  });
});

// The connectivity re-key behavior of the fallback loop (immediate retry on
// an online notification, and its sequencing behind the display.json
// refetch) is covered in AppContext.connectivity.test.tsx to keep this file
// inside the max-lines gate.

// An offline boot restores the persisted playlist but every remote asset
// fetch behind it is single-attempt, so the wall goes black and nothing ever
// retried once Wi-Fi came back. ArtworkPlayer reports the failed load through
// context; this effect turns the next online notification into one refresh.
describe('AppContext reconnect recovery', () => {
  const bootProbe = () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/default-playlist',
      },
    });
    return renderWithDegradedProbe();
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

  it('refreshes as soon as the artwork reports a failed load', async () => {
    // Covers the ordering where connectivity returned first and the fetch
    // only gave up seconds later: on a single-item playlist there is no
    // playlist advance to retry it, so the degraded edge has to be a trigger
    // in its own right or the wall stays black indefinitely.
    const probe = bootProbe();
    await waitFor(() => {
      expect(screen.getByTestId('app-ready')).toBeTruthy();
    });

    probe.setPlaybackDegraded(true);

    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes again when connectivity returns while still degraded', async () => {
    const probe = bootProbe();
    await waitFor(() => {
      expect(screen.getByTestId('app-ready')).toBeTruthy();
    });

    probe.setPlaybackDegraded(true);
    notifyOnline();

    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(2);
  });

  it('does not refresh when playback is healthy', async () => {
    bootProbe();
    await waitFor(() => {
      expect(screen.getByTestId('app-ready')).toBeTruthy();
    });

    notifyOnline();

    expect(canvasServiceMocks.requestArtworkRefresh).not.toHaveBeenCalled();
  });

  it('does not loop while the same artwork keeps failing', async () => {
    // The refresh re-mounts the SAME previewURL, so a repeat failure finds
    // the flag already set and ArtworkPlayer writes no new context state.
    // That is what makes an attempt cap unnecessary — this test pins it.
    const probe = bootProbe();
    await waitFor(() => {
      expect(screen.getByTestId('app-ready')).toBeTruthy();
    });

    probe.setPlaybackDegraded(true);
    probe.setPlaybackDegraded(true);
    probe.setPlaybackDegraded(true);

    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);
  });

  it('stops refreshing once the artwork loads successfully', async () => {
    const probe = bootProbe();
    await waitFor(() => {
      expect(screen.getByTestId('app-ready')).toBeTruthy();
    });

    probe.setPlaybackDegraded(true);
    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);

    probe.setPlaybackDegraded(false);
    notifyOnline();

    expect(canvasServiceMocks.requestArtworkRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('AppContext boot hydration vs live casts', () => {
  const bootWithDelayedHydration = () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/default-playlist',
      },
    });
    // versionUpdateReload short-circuits the boot-playlist read; criticalTemp
    // must NOT read as set or the restore path under test is never reached.
    deviceManager.getItem.mockImplementation((key: LocalStorageItem) =>
      Promise.resolve(
        key === LocalStorageItem.versionUpdateReload ? 'true' : null
      )
    );
    let resolveHydration: ((castInfo: CastInfo | null) => void) | undefined;
    deviceManager.getCastInfo.mockImplementation(
      () =>
        new Promise<CastInfo | null>(resolve => {
          resolveHydration = resolve;
        })
    );
    render(
      <AppProvider>
        <div data-testid="app-ready" />
      </AppProvider>
    );
    return () => resolveHydration;
  };

  const persistedCastInfo = () =>
    ({ castCommand: CastCommand.displayPlaylist }) as CastInfo;

  it('does not restore persisted cast state over a cast committed during hydration', async () => {
    // Forced-push race: the CDP entry point is live before hydration
    // finishes, so a forced displayDefaultPlaylist can fetch AND commit the
    // default playlist while initCastInfo is still awaiting storage. The
    // restore must then be skipped — applying stale persisted state would
    // overwrite the cast the controller just committed.
    const hydration = bootWithDelayedHydration();
    await waitFor(() => {
      expect(deviceManager.getCastInfo).toHaveBeenCalled();
    });

    // The forced default committed while getCastInfo was still pending.
    canvasServiceMocks.getCastInfo.mockImplementation(persistedCastInfo);
    await act(async () => {
      hydration()?.(persistedCastInfo());
      // Flush initCastInfo's continuation past the resolved read.
      await Promise.resolve();
    });

    // completeBootCastHydration fires in the finally AFTER initCastInfo
    // fully unwound — waiting for it proves the skip actually ran rather
    // than the continuation simply not having reached the restore yet.
    await waitFor(() => {
      expect(canvasServiceMocks.completeBootCastHydration).toHaveBeenCalled();
    });
    expect(canvasServiceMocks.setCastInfo).not.toHaveBeenCalled();
  });

  it('still restores persisted cast state when nothing committed during hydration', async () => {
    const hydration = bootWithDelayedHydration();
    await waitFor(() => {
      expect(deviceManager.getCastInfo).toHaveBeenCalled();
    });

    await act(async () => {
      hydration()?.(persistedCastInfo());
      // Flush initCastInfo's continuation past the resolved read.
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(canvasServiceMocks.setCastInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          castCommand: CastCommand.displayPlaylist,
        }),
        false
      );
    });
  });
});

describe('AppContext displayDefaultPlaylist requests', () => {
  it('re-arms the fallback loop when a displayDefaultPlaylist event arrives', async () => {
    // CanvasService delegates the displayDefaultPlaylist CDP command here via
    // the DisplayDefaultPlaylist event, so a controld push (claim-time kick,
    // OOM recovery) resolves the playlist through the same loop as the
    // player's own pull — even after that loop already finished.
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/default-playlist',
      },
    });

    vi.useFakeTimers();
    render(
      <AppProvider>
        <div data-testid="app-ready" />
      </AppProvider>
    );

    // Boot fallback casts once and clears the flag.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);

    // A pushed default-playlist request restarts the loop immediately.
    await act(async () => {
      window.dispatchEvent(new CustomEvent(CustomEventName.DisplayDefaultPlaylist));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(2);
  });

  it('does not lose a request that arrives while an attempt is in flight', async () => {
    // The success handler clears `active` with a nonce guard: if the pushed
    // request's {active:true, nonce+1} update commits together with the
    // in-flight attempt's clear (React batching), an unguarded clear would
    // swallow the push before its effect run ever fired.
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/default-playlist',
      },
    });
    let resolveFirst: ((casted: boolean) => void) | undefined;
    canvasServiceMocks.castPlaylistByURL
      .mockImplementationOnce(
        () =>
          new Promise<boolean>(resolve => {
            resolveFirst = resolve;
          })
      )
      .mockImplementation(() => Promise.resolve(true));

    vi.useFakeTimers();
    render(
      <AppProvider>
        <div data-testid="app-ready" />
      </AppProvider>
    );

    // Boot fallback starts its first attempt, which hangs in flight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(canvasServiceMocks.castPlaylistByURL).toHaveBeenCalledTimes(1);

    // A push lands mid-flight, then the in-flight attempt succeeds. Whatever
    // the interleaving (cancelled attempt or same-commit batching), the
    // pushed request must still produce a cast.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CustomEventName.DisplayDefaultPlaylist)
      );
      resolveFirst?.(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    const castsAfterPush =
      canvasServiceMocks.castPlaylistByURL.mock.calls.length;
    expect(castsAfterPush).toBeGreaterThanOrEqual(2);

    // And the loop settled — no runaway retries after the successful cast.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(canvasServiceMocks.castPlaylistByURL.mock.calls.length).toBe(
      castsAfterPush
    );
  });

});
