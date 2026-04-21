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

describe('RemoteConfigService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

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
