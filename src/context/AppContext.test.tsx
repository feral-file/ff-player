import { AppProvider } from '@/context/AppContext';
import axios from 'axios';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
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
    getInstance: vi.fn(() => ({ cleanup: vi.fn() })),
  },
}));

vi.mock('@/services/CanvasService', () => ({
  canvasService: {
    castPlaylistByURL: vi.fn().mockResolvedValue(undefined),
    setCastInfo: vi.fn(),
  },
}));

vi.mock('@/utils/DeviceManager', () => ({
  default: deviceManager,
}));

const axiosGet = vi.mocked(axios.get);

describe('AppContext boot recovery', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
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

    await waitFor(() => expect(screen.getByTestId('app-ready')).toBeTruthy());

    expect(deviceManager.getItem).toHaveBeenCalledWith('versionUpdateReload');
    expect(deviceManager.removeItem).toHaveBeenCalledWith('versionUpdateReload');
    expect(deviceManager.getBootPlaylist).not.toHaveBeenCalled();
  });
});
