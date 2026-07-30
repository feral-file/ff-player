import { AppSettings } from '@/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import RemoteConfigService from './remoteConfigService';

const { axiosGet } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    get: axiosGet,
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

/** Clears env stubs and axios mock calls between RemoteConfigService tests. */
function resetRemoteConfigTestEnv() {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
}

describe('RemoteConfigService defaults', () => {
  afterEach(resetRemoteConfigTestEnv);

  it('falls back to the local default playlist URL when the remote config omits it', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1234,
        defaultPlaylistURL: '   ',
      },
    });

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: 1234,
      defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
    });
  });

  it('keeps a legacy duration payload while still using the local playlist default', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 4321,
      },
    });

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: 4321,
      defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
    });
  });

  it('falls back to the local runtime defaults when the fetch fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockRejectedValueOnce(new Error('network down'));

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
      defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
    });
  });
});

describe('RemoteConfigService caching', () => {
  afterEach(resetRemoteConfigTestEnv);

  it('caches a config that came from the remote fetch', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/published',
      },
    });

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toMatchObject({
      defaultPlaylistURL: 'https://example.com/published',
    });
    await expect(service.getAppRemoteConfig()).resolves.toMatchObject({
      defaultPlaylistURL: 'https://example.com/published',
    });
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it('does not cache the fallback, so a later call reaches the network', async () => {
    // Offline-boot regression: fetchConfig never rejects (it answers with
    // local defaults), so caching its result pinned the whole page lifetime
    // to those defaults and the published display.json was never read again
    // even after Wi-Fi came up.
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockRejectedValueOnce(new Error('network down'));
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/published',
      },
    });

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
      defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
    });
    expect(axiosGet).toHaveBeenCalledTimes(1);

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: 1000,
      defaultPlaylistURL: 'https://example.com/published',
    });
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });
});

describe('RemoteConfigService concurrent reads', () => {
  afterEach(resetRemoteConfigTestEnv);

  it('exposes the cache by reference for the superseded-run carve-out', async () => {
    // AppContext commits from a cancelled effect run only when the resolved
    // config IS the cache (identity comparison), so getCachedConfig must
    // return null until a remote read lands and then the very object
    // getAppRemoteConfig resolves with. A defensive copy anywhere on that
    // path would silently disable the flapping-link recovery — pinned here,
    // at the layer that owns the invariant.
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockRejectedValueOnce(new Error('offline'));
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 1000,
        defaultPlaylistURL: 'https://example.com/published',
      },
    });

    const service = new RemoteConfigService();
    expect(service.getCachedConfig()).toBeNull();

    // A failed read resolves with local defaults and caches nothing.
    await service.getAppRemoteConfig();
    expect(service.getCachedConfig()).toBeNull();

    // A remote success resolves with the cache object itself.
    const published = await service.getAppRemoteConfig();
    expect(service.getCachedConfig()).toBe(published);
  });

  it('does not let a late fallback clobber a config that already landed', async () => {
    // AppContext re-reads this on every online notification, so a request
    // left hanging on a dying link can still be in flight when a later one
    // succeeds. If the slow failure handed its LOCAL fallback back, the
    // caller would commit it, revert defaultPlaylistURL to the built-in
    // default, and re-arm the very fallback-playlist bug this caching rule
    // exists to prevent.
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    const published = {
      duration: 1000,
      defaultPlaylistURL: 'https://example.com/published',
    };
    let failSlowRead: ((error: Error) => void) | undefined;
    axiosGet.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failSlowRead = reject;
        })
    );
    axiosGet.mockResolvedValueOnce({ data: published });

    const service = new RemoteConfigService();

    // The slow read is still in flight when the second one succeeds and
    // caches the published config.
    const slowRead = service.getAppRemoteConfig();
    await expect(service.getAppRemoteConfig()).resolves.toEqual(published);

    failSlowRead?.(new Error('link died mid-request'));

    await expect(slowRead).resolves.toEqual(published);
    // And the cache itself survived: no third request, still published.
    await expect(service.getAppRemoteConfig()).resolves.toEqual(published);
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('does not let a slow older success overwrite a config that already landed', async () => {
    // Inverse of the late-fallback case: both overlapping reads SUCCEED, and
    // the one settling last is the OLDER request. If it overwrote the cache,
    // a config a concurrent caller already committed would be replaced with
    // stale data for the rest of the page lifetime. First landed must win.
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    const stale = {
      duration: 1000,
      defaultPlaylistURL: 'https://example.com/stale',
    };
    const landed = {
      duration: 2000,
      defaultPlaylistURL: 'https://example.com/landed',
    };
    let resolveSlowRead: ((response: { data: unknown }) => void) | undefined;
    axiosGet.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSlowRead = resolve;
        })
    );
    axiosGet.mockResolvedValueOnce({ data: landed });

    const service = new RemoteConfigService();

    // The slow read is still in flight when the second one succeeds and
    // caches its config.
    const slowRead = service.getAppRemoteConfig();
    await expect(service.getAppRemoteConfig()).resolves.toEqual(landed);

    resolveSlowRead?.({ data: stale });

    // The slow older read converges on the already-landed config...
    await expect(slowRead).resolves.toEqual(landed);
    // ...and the cache kept it: no third request, still the landed config.
    await expect(service.getAppRemoteConfig()).resolves.toEqual(landed);
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });
});

describe('RemoteConfigService duration normalization', () => {
  afterEach(resetRemoteConfigTestEnv);

  it('leaves duration undefined when display.json omits it', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        defaultPlaylistURL: 'https://example.com/playlist',
      },
    });

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: undefined,
      defaultPlaylistURL: 'https://example.com/playlist',
    });
  });

  it('preserves zero duration and clamps negative duration to zero', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 0,
        defaultPlaylistURL: 'https://example.com/a',
      },
    });
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: -1,
        defaultPlaylistURL: 'https://example.com/b',
      },
    });

    const zeroDuration = new RemoteConfigService();
    await expect(zeroDuration.getAppRemoteConfig()).resolves.toMatchObject({
      duration: 0,
    });

    const negativeDuration = new RemoteConfigService();
    await expect(negativeDuration.getAppRemoteConfig()).resolves.toMatchObject({
      duration: 0,
    });
  });

  it('treats non-numeric duration as undefined', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        duration: 'not-a-number' as unknown as number,
        defaultPlaylistURL: 'https://example.com/c',
      },
    });

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: undefined,
      defaultPlaylistURL: 'https://example.com/c',
    });
  });
});

describe('RemoteConfigService Sentry sampling', () => {
  afterEach(() => {
    resetRemoteConfigTestEnv();
    vi.useRealTimers();
  });

  it('reports a failing class once, not per repeated fetchConfig call', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockRejectedValue(new Error('network down'));

    // fetchConfig is never cached on failure, so AppContext's online-notification
    // re-reads reach the network — and this sampling — every time.
    const service = new RemoteConfigService();
    await service.getAppRemoteConfig();
    await service.getAppRemoteConfig();
    await service.getAppRemoteConfig();

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('samples distinct error classes independently', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    /** Distinct error class from the plain `Error` used elsewhere in this suite. */
    class CustomFetchError extends Error {}
    axiosGet.mockRejectedValueOnce(new Error('network down'));
    axiosGet.mockRejectedValueOnce(new CustomFetchError('different class'));

    const service = new RemoteConfigService();
    await service.getAppRemoteConfig();
    await service.getAppRemoteConfig();

    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('re-reports the same class once the sampling window elapses', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockRejectedValue(new Error('network down'));

    const service = new RemoteConfigService();
    await service.getAppRemoteConfig();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    // Still inside the 6h window: no second event for the still-ongoing outage.
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - 1);
    await service.getAppRemoteConfig();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    // Window elapsed: the outage is still new information worth a fresh event.
    await vi.advanceTimersByTimeAsync(1);
    await service.getAppRemoteConfig();
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });
});
