import { CastCommand, type CastInfo } from '@/models';
import { type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';

const service = canvasService as unknown as {
  castInfo: CastInfo | null;
  onRefreshArtwork: (() => boolean) | null;
};

const playlist: DP1Call = {
  dpVersion: '1',
  id: 'active',
  title: 'Active Playlist',
  items: [
    { id: 'A', source: 'https://example.com/A.jpg', license: {} } as DP1Item,
    { id: 'B', source: 'https://example.com/B.jpg', license: {} } as DP1Item,
  ],
};

afterEach(() => {
  canvasService.setCastInfo(null, false);
  service.onRefreshArtwork = null;
});

it('replays a pending refresh when the handler registers later', () => {
  canvasService.setCastInfo(
    { castCommand: CastCommand.displayPlaylist, playlist, index: 1 },
    false
  );

  expect(
    canvasService.processMessage({ command: CastCommand.refreshArtwork, request: {} })
  ).toEqual({ ok: false });

  const refreshSpy = vi.fn(() => true);
  service.onRefreshArtwork = refreshSpy;

  expect(refreshSpy).toHaveBeenCalledTimes(1);
  expect(
    canvasService.processMessage({ command: CastCommand.refreshArtwork, request: {} })
  ).toEqual({ ok: true });
});
