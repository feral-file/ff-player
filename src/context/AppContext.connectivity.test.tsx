/**
 * Connectivity re-key behavior of the boot fallback-playlist loop.
 *
 * Split from AppContext.test.tsx (max-lines gate). Two contracts live here:
 * an online notification must retry a failed fallback immediately instead of
 * waiting out the backoff, and a fallback cast that lands with a stale URL —
 * because the retry raced the display.json refetch, or because the playlist
 * host was reachable while the config host was not — must be superseded once
 * the published defaultPlaylistURL arrives. Without the supersede, the
 * successful stale cast clears the request and the published config finds
 * nothing left to cast it, pinning the device to the built-in default for
 * the page lifetime.
 */
import { AppProvider } from '@/context/AppContext';
import { AppSettings } from '@/constants';
import { CustomEventName } from '@/models/custom_event';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGet, canvasServiceMocks, deviceManager } = vi.hoisted(() => {
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
      getCastInfo: vi.fn(() => null),
      setCastInfo: vi.fn(),
      requestArtworkRefresh: vi.fn(() => true),
      wasHaltedDuringBootHydration: vi.fn(() => false),
      didHydrationHaltClearCast: vi.fn(() => false),
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
    wasHaltedDuringBootHydration: canvasServiceMocks.wasHaltedDuringBootHydration,
    didHydrationHaltClearCast: canvasServiceMocks.didHydrationHaltClearCast,
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

// vitest.config enables restoreMocks, which strips mockResolvedValue /
// mockImplementation from hoisted spies before each test; re-apply defaults.
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
  canvasServiceMocks.wasHaltedDuringBootHydration.mockImplementation(
    () => false
  );
  canvasServiceMocks.didHydrationHaltClearCast.mockImplementation(() => false);
});

const PUBLISHED_URL = 'https://example.com/published';

/**
 * Boots the provider with the display.json read failing (local defaults
 * settle) and the boot fallback cast resolving `bootCastResult`, then
 * flushes boot promises. Every scenario here starts from this state.
 */
const bootWithConfigHostDown = async (bootCastResult: boolean) => {
  vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
  axiosGet.mockRejectedValueOnce(new Error('config host unreachable'));
  canvasServiceMocks.castPlaylistByURL.mockResolvedValueOnce(bootCastResult);
  vi.useFakeTimers();
  render(
    <AppProvider>
      <div data-testid="app-ready" />
    </AppProvider>
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

const notifyOnline = async () => {
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(CustomEventName.ConnectivityChange, {
        detail: { isOnline: true },
      })
    );
    await vi.advanceTimersByTimeAsync(0);
  });
};

/** Queues the next display.json read to succeed with the published URL. */
const queuePublishedConfig = () => {
  axiosGet.mockResolvedValueOnce({
    data: { duration: 1000, defaultPlaylistURL: PUBLISHED_URL },
  });
};

const castCalls = () => canvasServiceMocks.castPlaylistByURL.mock.calls;

describe('AppContext connectivity re-key', () => {
  it('an online notification retries immediately instead of waiting out the backoff', async () => {
    // useNetworkManger boots at `true`, so on an offline SoftAP boot the
    // first ConnectivityChange({isOnline: true}) is a true→true no-op that
    // never re-keyed the old isOnline-based effect — a failed boot attempt
    // sat out the full 5–60s backoff. The loop must re-key on the
    // notification itself.
    await bootWithConfigHostDown(false);
    expect(castCalls()).toHaveLength(1);

    // Provisioning lands well before the backoff expires: the online
    // notification must fire a fresh attempt immediately, racing the config
    // refetch instead of waiting on it — a stale winner is superseded.
    queuePublishedConfig();
    await notifyOnline();
    expect(castCalls().length).toBeGreaterThanOrEqual(2);
  });
});

describe('AppContext fallback supersede on config change', () => {
  it('supersedes a successful built-in cast once the published config lands', async () => {
    // Cross-generation pinning: the playlist host is reachable while the
    // config host is not, so the boot fallback cast SUCCEEDS with the
    // built-in default and clears the request. The published URL landing on
    // a later notification must re-arm the loop, or the device plays the
    // built-in default for the page lifetime.
    await bootWithConfigHostDown(true);
    expect(castCalls()).toHaveLength(1);
    expect(castCalls()[0][0]).toBe(AppSettings.DEFAULT_PLAYLIST_URL);

    queuePublishedConfig();
    await notifyOnline();
    expect(castCalls()).toHaveLength(2);
    expect(castCalls()[1][0]).toBe(PUBLISHED_URL);

    // The superseding request settled on the published cast: no retries.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(castCalls()).toHaveLength(2);
  });

  it('supersedes a stale cast that wins the race against the config refetch', async () => {
    // Within-generation race: the online notification re-keys the retry AND
    // the refetch. The retry casting the stale built-in URL first used to
    // clear the request and strand the published URL with nothing to cast.
    await bootWithConfigHostDown(false);
    expect(castCalls()).toHaveLength(1);

    // The refetch hangs while the retried cast succeeds with the stale URL.
    let resolveConfigRead: ((response: { data: unknown }) => void) | undefined;
    axiosGet.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveConfigRead = resolve;
        })
    );
    await notifyOnline();
    expect(castCalls()).toHaveLength(2);
    expect(castCalls()[1][0]).toBe(AppSettings.DEFAULT_PLAYLIST_URL);

    // The published config lands late → the stale winner is superseded.
    await act(async () => {
      resolveConfigRead?.({
        data: { duration: 1000, defaultPlaylistURL: PUBLISHED_URL },
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(castCalls()).toHaveLength(3);
    expect(castCalls()[2][0]).toBe(PUBLISHED_URL);
  });

  it('does not supersede content the controller cast explicitly', async () => {
    // The supersede exists to fix a WRONG FALLBACK, never to replace real
    // content: once an explicit cast owns the wall, a config change landing
    // afterwards must not re-cast the default playlist over it.
    await bootWithConfigHostDown(true);
    expect(castCalls()).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CustomEventName.ExplicitPlaylistCast)
      );
      await vi.advanceTimersByTimeAsync(0);
    });

    queuePublishedConfig();
    await notifyOnline();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(castCalls()).toHaveLength(1);
  });
});

describe('AppContext fallback stand-down on controller stop', () => {
  it('a controller stop disarms the supersede', async () => {
    // disconnect / setSleepMode(true) dispatch PlaybackHalted. A published
    // config landing after the stop must not re-arm the fallback: its cast
    // navigates to '/' and would relight the cleared wall or wake the
    // sleeping device.
    await bootWithConfigHostDown(true);
    expect(castCalls()).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(CustomEventName.PlaybackHalted));
      await vi.advanceTimersByTimeAsync(0);
    });

    queuePublishedConfig();
    await notifyOnline();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(castCalls()).toHaveLength(1);
  });

  it('a controller stop cancels an armed retry loop', async () => {
    // Same family, other half: a fallback still retrying toward its next
    // attempt must stand down too, or reconnect would cast the default
    // playlist onto the wall the controller just stopped.
    await bootWithConfigHostDown(false);
    expect(castCalls()).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(CustomEventName.PlaybackHalted));
      await vi.advanceTimersByTimeAsync(0);
    });

    queuePublishedConfig();
    await notifyOnline();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(castCalls()).toHaveLength(1);
  });
});

describe('AppContext sleep through the boot fallback, wake after reconnect', () => {
  it('the wake re-arm casts the published playlist a sleeping device missed', async () => {
    // Offline first boot: the fallback is retrying with nothing playable.
    // Sleep stands it down; Wi-Fi and the published config arrive DURING
    // sleep (correctly casting nothing); wake re-enters the fallback flow —
    // the device wakes to the published playlist instead of an empty
    // player. CanvasService is mocked in this suite, so the wake's
    // DisplayDefaultPlaylist event is hand-dispatched here: this pins the
    // AppContext half of the seam (a stood-down fallback, re-armed, casts
    // the PUBLISHED URL, not the stale one); the dispatch half is pinned in
    // CanvasService.explicitCast.test.ts.
    await bootWithConfigHostDown(false);
    expect(castCalls()).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(CustomEventName.PlaybackHalted));
      await vi.advanceTimersByTimeAsync(0);
    });

    // Reconnect while asleep: config lands, wall must stay dark.
    queuePublishedConfig();
    await notifyOnline();
    expect(castCalls()).toHaveLength(1);

    // Wake with nothing playable → CanvasService dispatches this event.
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(CustomEventName.DisplayDefaultPlaylist)
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(castCalls()).toHaveLength(2);
    expect(castCalls()[1][0]).toBe(PUBLISHED_URL);
  });
});

describe('AppContext config commit across cancelled generations', () => {
  it('publishes a config landed by a superseded read after the newer read failed over', async () => {
    // Flapping-link ordering: the boot read hangs, a later notification's
    // own read fails fast and commits local defaults, then the OLD read
    // finally succeeds. Its effect run is cancelled, but the config it
    // landed is the immutable page-lifetime cache — dropping that commit
    // would leave the wall on the built-in default with the published
    // config stranded in the cache and no further notification due to
    // publish it.
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    let resolveBootRead: ((response: { data: unknown }) => void) | undefined;
    axiosGet.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveBootRead = resolve;
        })
    );
    axiosGet.mockRejectedValueOnce(new Error('link flapped'));
    vi.useFakeTimers();
    render(
      <AppProvider>
        <div data-testid="app-ready" />
      </AppProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Boot read still in flight: no config committed, no cast attempted.
    expect(castCalls()).toHaveLength(0);

    // The notification's read fails fast → local defaults commit and the
    // boot-armed request casts the built-in default.
    await notifyOnline();
    expect(castCalls()).toHaveLength(1);
    expect(castCalls()[0][0]).toBe(AppSettings.DEFAULT_PLAYLIST_URL);

    // The superseded boot read lands the published config → it must still
    // commit, and the supersede effect re-casts the published URL.
    await act(async () => {
      resolveBootRead?.({
        data: { duration: 1000, defaultPlaylistURL: PUBLISHED_URL },
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(castCalls()).toHaveLength(2);
    expect(castCalls()[1][0]).toBe(PUBLISHED_URL);
  });
});
