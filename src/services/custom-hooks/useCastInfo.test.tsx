/** @vitest-environment jsdom */
import { CastCommand, RenderStatus, type CastInfo } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCastInfo from './useCastInfo';

vi.mock('@/utils/DeviceManager', () => ({
  default: {
    setDeviceInfo: vi.fn(() => Promise.resolve(undefined)),
  },
}));

beforeEach(() => {
  vi.mocked(DeviceManager.setDeviceInfo).mockImplementation(() =>
    Promise.resolve(undefined)
  );
});

afterEach(() => {
  canvasService.onCastInfoChange = null;
  canvasService.setCastInfo(null, false);
  cleanup();
  vi.clearAllMocks();
});

describe('useCastInfo persistence', () => {
  it('strips renderStatus before persisting cast info', async () => {
    renderHook(() => useCastInfo());

    const playlist = {
      dpVersion: '1',
      id: 'active',
      title: 'active',
      items: [
        {
          id: 'A',
          source: 'https://example.com/a.jpg',
          license: {},
        } as DP1Item,
      ],
    } as DP1Call;

    act(() => {
      canvasService.onCastInfoChange?.({
        castCommand: CastCommand.displayPlaylist,
        playlist,
        index: 0,
        renderStatus: RenderStatus.ready,
      });
    });

    await waitFor(() => {
      expect(DeviceManager.setDeviceInfo).toHaveBeenCalled();
    });

    const stored = vi.mocked(DeviceManager.setDeviceInfo).mock
      .calls.at(-1)?.[0] as CastInfo | null | undefined;
    expect(stored).toEqual({
      castCommand: CastCommand.displayPlaylist,
      playlist,
      index: 0,
    });
    expect(stored).not.toHaveProperty('renderStatus');
  });
});
