/** @vitest-environment jsdom */
import { CastCommand, RenderStatus, type CastInfo } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useCastInfo from './useCastInfo';

const { setDeviceInfo } = vi.hoisted(() => ({
  setDeviceInfo: vi.fn<(castInfo: CastInfo | null) => Promise<void>>(() =>
    Promise.resolve(undefined)
  ),
}));

vi.mock('@/utils/DeviceManager', () => ({
  default: {
    setDeviceInfo,
  },
}));

beforeEach(() => {
  setDeviceInfo.mockImplementation(() => Promise.resolve(undefined));
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
      expect(setDeviceInfo).toHaveBeenCalled();
    });

    const stored: CastInfo | null | undefined = setDeviceInfo.mock.calls.at(
      -1
    )?.[0];
    expect(stored).toEqual({
      castCommand: CastCommand.displayPlaylist,
      playlist,
      index: 0,
    });
    expect(stored).not.toHaveProperty('renderStatus');
  });
});
