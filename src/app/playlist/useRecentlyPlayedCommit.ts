import { DP1Defaults, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import type { ContentContext } from '@/services/contentPolicy';
import { itemIdentityFor, normalizePlaylistIndex } from '@/utils/playlist';
import { useCallback } from 'react';

/**
 * Records only successfully played media, not a selected playlist index.
 */
export function useRecentlyPlayedCommit(
  playlist: DP1Item[],
  playlistDefaults: DP1Defaults | null,
  contentContext: ContentContext
) {
  return useCallback(
    (identity: string) => {
      const item = playlist.find(
        (unused, index) =>
          itemIdentityFor(
            playlist,
            normalizePlaylistIndex(index, playlist.length)
          ) === identity
      );
      if (item) {
        canvasService.recordRecentlyPlayed(item, playlistDefaults, contentContext);
      }
    },
    [contentContext, playlist, playlistDefaults]
  );
}
