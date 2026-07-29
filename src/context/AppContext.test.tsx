import { AppProvider } from '@/context/AppContext';
import { LocalStorageItem } from '@/constants';
import { CastCommand, RenderStatus, type CastInfo } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGet, canvasServiceMocks, deviceManager } =
  vi.hoisted(() => {
    const deviceManager = {
      getDeviceDisplaySettings: vi.fn().mockResolvedValue(null),
      getItem: vi.fn().mockResolvedValue('true'),
      removeItem: vi.fn().mockResolvedValue(undefined),
      getBootPlaylist: vi.fn().mockResolvedValue(null),
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
  },
}));

vi.mock('@/utils/DeviceManager', () => ({
  default: deviceManager,
}));

/** Re-apply DeviceManager / CanvasService mock defaults after restoreMocks. */
function resetAppContextMocks() {
  deviceManager.getItem.mockResolvedValue('true');
  deviceManager.getCastInfo.mockResolvedValue(null);
  deviceManager.getBootPlaylist.mockResolvedValue(null);
  deviceManager.getDeviceDisplaySettings.mockResolvedValue(null);
  deviceManager.removeItem.mockResolvedValue(undefined);
  deviceManager.setItem.mockResolvedValue(undefined);
  deviceManager.setDeviceDisplaySettings.mockResolvedValue(undefined);
  deviceManager.setDeviceInfo.mockResolvedValue(undefined);
  canvasServiceMocks.castPlaylistByURL.mockImplementation(() =>
    Promise.resolve(undefined)
  );
}

/** Stub remote-config fetch used during AppProvider boot. */
function stubRemoteConfig() {
  vi.stubEnv('NEXT_PUBLIC_PUB_DOC_URL', 'https://docs.example.com');
  axiosGet.mockResolvedValueOnce({
    data: {
      duration: 1000,
      defaultPlaylistURL: 'https://example.com/default-playlist',
    },
  });
}

describe('AppContext boot recovery', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  // vitest.config enables restoreMocks, which strips mockResolvedValue / mockImplementation
  // from hoisted spies before each test; re-apply defaults here.
  beforeEach(() => {
    resetAppContextMocks();
  });

  it('skips boot playlist restoration after a version update reload', async () => {
    stubRemoteConfig();

    render(
      <AppProvider>
        <div data-testid="app-ready" />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('app-ready')).toBeTruthy();
    });

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
});

describe('AppContext renderStatus recovery', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    resetAppContextMocks();
  });

  it('strips persisted renderStatus before hydrating recovered cast info', async () => {
    stubRemoteConfig();
    deviceManager.getItem.mockResolvedValue(null);

    const playlist = {
      dpVersion: '1',
      id: 'recovered',
      title: 'recovered',
      items: [
        {
          id: 'A',
          source: 'https://example.com/a.jpg',
          license: {},
        } as DP1Item,
      ],
    } as DP1Call;

    deviceManager.getCastInfo.mockResolvedValue({
      castCommand: CastCommand.displayPlaylist,
      playlist,
      index: 0,
      renderStatus: RenderStatus.ready,
    });

    render(
      <AppProvider>
        <div data-testid="app-ready" />
      </AppProvider>
    );

    await waitFor(() => {
      expect(canvasServiceMocks.setCastInfo).toHaveBeenCalled();
    });

    const hydrated = canvasServiceMocks.setCastInfo.mock.calls.at(-1)?.[0] as
      | CastInfo
      | undefined;
    expect(hydrated).toEqual({
      castCommand: CastCommand.displayPlaylist,
      playlist,
      index: 0,
    });
    expect(hydrated).not.toHaveProperty('renderStatus');
  });
});
