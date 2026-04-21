import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Glue between PlaylistClient's explicit-navigation rotation and
 * `usePlaylistIntermissionPhase`.
 *
 * When a `moveToArtwork` cast arrives, the client rotates `playlistKey` so
 * `useOverlayInterruptSuppression` drops its baseline and the intermission
 * hook clears dismissal — the destination item's intro is free to render.
 *
 * That is enough for spec cases 1 (artwork → artwork + intro) and 2
 * (itemIntro → itemIntro). Case 3 (playlist intro on screen → moveToArtwork)
 * also needs the playlist intro to be dismissed, because rotation RESETS
 * dismissal and the "auto-dismiss when currentIndex > 0" rule does not fire
 * when the target is slot 0.
 *
 * `markRotation(newKey)` stores the post-rotation key. The layout effect
 * then dismisses the playlist intro as soon as `playlistKey` has advanced to
 * that key, synchronously with the commit (before paint) so users do not
 * see a flash of the welcome after an explicit jump.
 *
 * The ref pairing guards against dismissing a key the client did not
 * rotate: cross-playlist queued promotions have their own intro-show
 * contract and must not be silenced by this bypass.
 */
export function usePlaylistIntroBypassOnMove(input: {
  playlistKey: string;
  completePlaylistIntro: () => void;
}): (newKey: string) => void {
  const { playlistKey, completePlaylistIntro } = input;
  const pendingRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (pendingRef.current === playlistKey) {
      pendingRef.current = null;
      completePlaylistIntro();
    }
  }, [playlistKey, completePlaylistIntro]);

  return useCallback((newKey: string) => {
    pendingRef.current = newKey;
  }, []);
}
