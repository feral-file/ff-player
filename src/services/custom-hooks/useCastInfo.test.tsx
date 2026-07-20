/** @vitest-environment jsdom */
/**
 * Persistence contracts for useCastInfo:
 * strip ephemeral renderStatus before IndexedDB write;
 * skip persist thrash when only renderStatus changes;
 * rewrite playlist-control commands (including updateDefaultDuration) to
 * displayPlaylist so AppContext boot replay can populate the playlist route.
 */
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

/** Minimal playlist fixture for persistence assertions. */
function makePlaylist(): DP1Call {
  return {
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
}

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items: [item('a'), item('b')],
});

/** A two-item cast at index 1 carrying [castCommand]. */
function castWith(castCommand: CastCommand): CastInfo {
  return {
    castCommand,
    playlist: playlist('pl'),
    index: 1,
  };
}

beforeEach(() => {
  setDeviceInfo.mockImplementation(() => Promise.resolve(undefined));
});

afterEach(() => {
  canvasService.onCastInfoChange = null;
  canvasService.setCastInfo(null, false);
  cleanup();
  vi.clearAllMocks();
});

describe('useCastInfo persistence strip', () => {
  it('strips renderStatus before persisting cast info', async () => {
    renderHook(() => useCastInfo());
    const activePlaylist = makePlaylist();

    act(() => {
      canvasService.onCastInfoChange?.({
        castCommand: CastCommand.displayPlaylist,
        playlist: activePlaylist,
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
      playlist: activePlaylist,
      index: 0,
    });
    expect(stored).not.toHaveProperty('renderStatus');
  });

  it('rewrites playlist-control commands and strips renderStatus', async () => {
    renderHook(() => useCastInfo());
    const activePlaylist = makePlaylist();

    act(() => {
      canvasService.onCastInfoChange?.({
        castCommand: CastCommand.updateIndex,
        playlist: activePlaylist,
        index: 0,
        renderStatus: RenderStatus.loading,
      });
    });

    await waitFor(() => {
      expect(setDeviceInfo).toHaveBeenCalled();
    });

    expect(setDeviceInfo.mock.calls.at(-1)?.[0]).toEqual({
      castCommand: CastCommand.displayPlaylist,
      playlist: activePlaylist,
      index: 0,
    });
  });
});

describe('useCastInfo persistence thrash', () => {
  it('does not persist again when only renderStatus changes', async () => {
    renderHook(() => useCastInfo());
    const activePlaylist = makePlaylist();

    act(() => {
      canvasService.onCastInfoChange?.({
        castCommand: CastCommand.displayPlaylist,
        playlist: activePlaylist,
        index: 0,
        renderStatus: RenderStatus.pending,
      });
    });

    await waitFor(() => {
      expect(setDeviceInfo).toHaveBeenCalledTimes(1);
    });

    act(() => {
      canvasService.onCastInfoChange?.({
        castCommand: CastCommand.displayPlaylist,
        playlist: activePlaylist,
        index: 0,
        renderStatus: RenderStatus.loading,
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(setDeviceInfo).toHaveBeenCalledTimes(1);

    act(() => {
      canvasService.onCastInfoChange?.({
        castCommand: CastCommand.displayPlaylist,
        playlist: activePlaylist,
        index: 1,
        renderStatus: RenderStatus.ready,
      });
    });

    await waitFor(() => {
      expect(setDeviceInfo).toHaveBeenCalledTimes(2);
    });

    expect(setDeviceInfo.mock.calls.at(-1)?.[0]).toEqual({
      castCommand: CastCommand.displayPlaylist,
      playlist: activePlaylist,
      index: 1,
    });
  });
});

describe('useCastInfo persistence rewrite', () => {
  it('persists updateDefaultDuration as displayPlaylist for boot recovery', async () => {
    renderHook(() => useCastInfo());

    act(() => {
      canvasService.setCastInfo(castWith(CastCommand.updateDefaultDuration));
    });

    await waitFor(() => {
      expect(setDeviceInfo).toHaveBeenCalled();
    });

    const persisted = setDeviceInfo.mock.calls.at(-1)?.[0];
    expect(persisted?.castCommand).toBe(CastCommand.displayPlaylist);
    expect(persisted?.playlist?.items?.map(entry => entry.id)).toEqual([
      'a',
      'b',
    ]);
    expect(persisted?.index).toBe(1);
  });

  it('persists non-control commands unchanged', async () => {
    renderHook(() => useCastInfo());

    act(() => {
      canvasService.setCastInfo(castWith(CastCommand.displayPlaylist));
    });

    await waitFor(() => {
      expect(setDeviceInfo).toHaveBeenCalled();
    });

    expect(setDeviceInfo.mock.calls.at(-1)?.[0]?.castCommand).toBe(
      CastCommand.displayPlaylist
    );
  });
});
