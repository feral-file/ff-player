import { AppProvider } from '@/context/AppContext';
import { LocalStorageItem } from '@/constants';
import { act, render, screen, waitFor } from '@testing-library/react';
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
        castPlaylistByURL: vi.fn(() => Promise.resolve(true)),
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('@/services/cdp-handler/CDPRequestHandler', () => ({
  CDPRequestHandler: {
    getInstance: vi.fn(() => ({ cleanup: vi.fn(), initialize: vi.fn() })),
  },
}));

vi.mock('@/services/CanvasService', () => ({
  canvasService: {
    castPlaylistByURL: canvasServiceMocks.castPlaylistByURL,
    setCastInfo: canvasServiceMocks.setCastInfo,
  },
}));

vi.mock('@/utils/DeviceManager', () => ({
  default: deviceManager,
}));

describe('AppContext boot recovery', () => {
  afterEach(() => {
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
  });

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
