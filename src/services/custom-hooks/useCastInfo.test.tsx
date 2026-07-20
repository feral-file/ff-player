/**
 * Boot-recovery contract for cast persistence: control-only commands
 * (moveToArtwork, updateIndex, refreshPlaylist, setShuffle, setLoop,
 * updateDefaultDuration) must be rewritten to displayPlaylist before being
 * persisted. AppContext replays the persisted castInfo verbatim on boot, and
 * only displayPlaylist populates the playlist route — persisting a raw
 * control command would recover to a black screen.
 */
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import useCastInfo from './useCastInfo';

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

describe('useCastInfo persistence rewrite', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
  });

  it('persists updateDefaultDuration as displayPlaylist for boot recovery', async () => {
    renderHook(() => useCastInfo());

    act(() => {
      canvasService.setCastInfo(castWith(CastCommand.updateDefaultDuration));
    });

    await waitFor(() => {
      const persisted = DeviceManager.getCachedCastInfo();
      expect(persisted?.castCommand).toBe(CastCommand.displayPlaylist);
    });
    const persisted = DeviceManager.getCachedCastInfo();
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
      expect(DeviceManager.getCachedCastInfo()?.castCommand).toBe(
        CastCommand.displayPlaylist
      );
    });
  });
});
