import { AppSettings } from '@/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
      showRenderLoadingOverlay: true,
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
      showRenderLoadingOverlay: true,
    });
  });

  it('falls back to the local runtime defaults when the fetch fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockRejectedValueOnce(new Error('network down'));

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: AppSettings.VERSION_CHECK_INTERVAL_DURATION,
      defaultPlaylistURL: AppSettings.DEFAULT_PLAYLIST_URL,
      showRenderLoadingOverlay: true,
    });
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
      showRenderLoadingOverlay: true,
    });
  });

  it('respects the published render loading overlay switch when present', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
    axiosGet.mockResolvedValueOnce({
      data: {
        defaultPlaylistURL: 'https://example.com/playlist',
        showRenderLoadingOverlay: false,
      },
    });

    const service = new RemoteConfigService();

    await expect(service.getAppRemoteConfig()).resolves.toEqual({
      duration: undefined,
      defaultPlaylistURL: 'https://example.com/playlist',
      showRenderLoadingOverlay: false,
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
      showRenderLoadingOverlay: true,
    });
  });
});
