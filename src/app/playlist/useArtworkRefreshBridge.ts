import { useCallback, useEffect, useRef } from 'react';
import { canvasService } from '@/services/CanvasService';
import { normalizePlaylistIndex } from '@/utils/playlist';
import { DP1Item } from '@/models/dp1.model';

/**
 * ArtworkPlayer's itemIdentity is the DP-1 id when the item has one, and a
 * position-plus-source synthetic when it does not (see itemIdentityFor). Match
 * either shape rather than recomputing an index the commit no longer carries.
 */
function matchesIdentity(item: DP1Item, identity: string): boolean {
  return identity === item.id || identity.endsWith(`__${item.source}`);
}

/**
 * Keeps the Canvas refresh callback and mounted renderer registration together.
 *
 * `setPreview` receives the whole item, not just its source: the final media
 * gate asks whether the work the renderer is showing is still allowed, and it
 * identifies that work by id and source together. Publishing a URL without the
 * item that owns it would leave the gate looking for the previous work at the
 * new URL, and it would unmount the renderer this refresh just reloaded.
 */
export function useArtworkRefreshBridge(
  setPreviewURL: (url: string | null) => void,
  /** Also notified on every visual commit (the tombstone's handler). */
  onCommitted: (identity: string) => void
) {
  const artworkPerformReloadRef = useRef<(() => void) | null>(null);
  // The item the published preview URL belongs to — the work the renderer is
  // actually showing, which is NOT playlist[currentIndex] during a handoff: an
  // advance commits the new index and Canvas index before the new URL is
  // published, so for one render the index names the incoming work while the
  // screen still holds the outgoing one. The final media gate needs the work on
  // screen to recognise the URL it is rendering, so owner and URL are published
  // together here and never diverge.
  const previewOwnerRef = useRef<DP1Item | undefined>(undefined);
  // What the renderer has actually PAINTED, as opposed to what has been
  // selected for it. Selecting B publishes its URL immediately, but A stays on
  // screen until B loads and commits, so the gate must ask about A during that
  // window or a tightening that blocks A would authorise B and leave A visible
  // — indefinitely if B stalls. Empty until the first commit, when the only
  // honest answer is the slot being mounted to produce one.
  const committedOwnerRef = useRef<DP1Item | undefined>(undefined);
  /** The work on screen: what has been painted, else what is mounting to be. */
  const getShowing = useCallback(
    () => committedOwnerRef.current ?? previewOwnerRef.current, []);
  const publishPreview = useCallback((item: DP1Item) => {
    previewOwnerRef.current = item;
    setPreviewURL(item.source);
  }, [setPreviewURL]);
  /** Promote the selected preview once ArtworkPlayer reports it on screen. */
  const notePreviewCommitted = useCallback((identity: string) => {
    const pending = previewOwnerRef.current;
    if (pending && matchesIdentity(pending, identity)) {
      committedOwnerRef.current = pending;
    }
    onCommitted(identity);
  }, [onCommitted]);
  /**
   * Drop the painted work once it is no longer something the cast will show.
   *
   * Without this the gate can deadlock: policy retires painted A while allowed
   * B is still loading, the gate evaluates blocked A and unmounts the player,
   * and with no player left there is no commit to replace the owner — so the
   * gate keeps evaluating A and the wall stays black for good. Clearing lets it
   * fall back to the selected preview, which is what will actually be mounted.
   */
  const retireCommittedIfGone = useCallback((stillShowable: (item: DP1Item) => boolean) => {
    const committed = committedOwnerRef.current;
    if (committed && !stillShowable(committed)) {
      committedOwnerRef.current = undefined;
    }
  }, []);
  const clearPreview = useCallback(() => {
    previewOwnerRef.current = undefined;
    committedOwnerRef.current = undefined;
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
    getShowing, publishPreview, notePreviewCommitted, retireCommittedIfGone,
    clearPreview };
}
