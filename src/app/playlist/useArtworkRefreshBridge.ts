import { useCallback, useEffect, useRef } from 'react';
import { canvasService } from '@/services/CanvasService';
import { normalizePlaylistIndex } from '@/utils/playlist';
import { DP1Item } from '@/models/dp1.model';

/**
 * Keeps the Canvas refresh callback and mounted renderer registration together.
 *
 * `setPreview` receives the whole item, not just its source: the final media
 * gate asks whether the work the renderer is showing is still allowed, and it
 * identifies that work by id and source together. Publishing a URL without the
 * item that owns it would leave the gate looking for the previous work at the
 * new URL, and it would unmount the renderer this refresh just reloaded.
 */
export function useArtworkRefreshBridge(setPreviewURL: (url: string | null) => void) {
  const artworkPerformReloadRef = useRef<(() => void) | null>(null);
  // The item the published preview URL belongs to — the work the renderer is
  // actually showing, which is NOT playlist[currentIndex] during a handoff: an
  // advance commits the new index and Canvas index before the new URL is
  // published, so for one render the index names the incoming work while the
  // screen still holds the outgoing one. The final media gate needs the work on
  // screen to recognise the URL it is rendering, so owner and URL are published
  // together here and never diverge.
  const previewOwnerRef = useRef<DP1Item | undefined>(undefined);
  const publishPreview = useCallback((item: DP1Item) => {
    previewOwnerRef.current = item;
    setPreviewURL(item.source);
  }, [setPreviewURL]);
  const clearPreview = useCallback(() => {
    previewOwnerRef.current = undefined;
    setPreviewURL(null);
  }, [setPreviewURL]);
  const triggerArtworkRefresh = useCallback((): boolean => {
    const cast = canvasService.getCastInfo();
    const items = cast?.playlist?.items;
    const rawIndex = cast?.index;
    if (!items?.length || rawIndex === undefined) {return false;}
    const currentItem = items.at(normalizePlaylistIndex(rawIndex, items.length));
    const performReload = artworkPerformReloadRef.current;
    if (!currentItem?.source || !performReload) {return false;}
    publishPreview(currentItem);
    performReload();
    return true;
  }, [publishPreview]);

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
  return { artworkPerformReloadRef, triggerArtworkRefresh, registerArtworkReload,
    previewOwnerRef, publishPreview, clearPreview };
}
