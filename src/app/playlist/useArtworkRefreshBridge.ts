import { useCallback, useEffect, useRef } from 'react';
import { canvasService } from '@/services/CanvasService';
import { normalizePlaylistIndex } from '@/utils/playlist';

/** Keeps the Canvas refresh callback and mounted renderer registration together. */
export function useArtworkRefreshBridge(setPreviewURL: (url: string) => void) {
  const artworkPerformReloadRef = useRef<(() => void) | null>(null);
  const triggerArtworkRefresh = useCallback((): boolean => {
    const cast = canvasService.getCastInfo();
    const items = cast?.playlist?.items;
    const rawIndex = cast?.index;
    if (!items?.length || rawIndex === undefined) {return false;}
    const currentSource = items.at(normalizePlaylistIndex(rawIndex, items.length))?.source;
    const performReload = artworkPerformReloadRef.current;
    if (!currentSource || !performReload) {return false;}
    setPreviewURL(currentSource);
    performReload();
    return true;
  }, [setPreviewURL]);

  const registerArtworkReload = useCallback((reload: (() => void) | null) => {
    artworkPerformReloadRef.current = reload;
    if (reload) {
      // Second flush trigger (§4.2 recovery design): a refresh can be parked
      // after Canvas registration but before the media renderer mounts. The
      // setter rechecks that pending request now that reload exists. Teardown
      // must not flush: there is no mounted handler left to refresh.
      canvasService.onRefreshArtwork = triggerArtworkRefresh;
    }
  }, [triggerArtworkRefresh]);

  useEffect(() => {
    canvasService.onRefreshArtwork = triggerArtworkRefresh;
    return () => { canvasService.onRefreshArtwork = null; };
  }, [triggerArtworkRefresh]);
  return { artworkPerformReloadRef, triggerArtworkRefresh, registerArtworkReload };
}
