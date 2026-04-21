import { useEffect, useRef } from 'react';

import type { PlaylistPhase } from './usePlaylistIntermissionPhase';

/**
 * Suppression flag for in-flight intermission overlays.
 *
 * When an overlay is mounted, we snapshot the playback-context signature
 * (slot index + playlist length + item ordering) along with `playlistKey`.
 * If the signature shifts while `playlistKey` is unchanged and we are still
 * in a non-artwork phase, the overlay is suppressed (rendered as artwork) so
 * refresh/shuffle/moveToArtwork arriving mid-overlay do not freeze playback
 * behind a timer.
 *
 * Keep the signature scoped to state the **client owns**. Mixing in
 * `castInfo.playlist.id` used to couple the baseline to a prop that can lag
 * the component's own state across the Provider boundary, producing false
 * suppression once the id caught up after a queued promotion. Playlist
 * identity rotation is already handled by `playlistKey`.
 *
 * Resetting on `playlistKey` change ensures a **new** playlist's own intro is
 * NOT suppressed — only the overlay that was already on-screen when the
 * context flipped within the same playlist instance.
 *
 * Requires `hasItems` to be true before capturing a baseline, which avoids
 * false positives from transient boot / cast-clear states where `currentIndex`
 * is -1 and the playlist is empty: those would otherwise baseline the overlay
 * against an empty signature and immediately suppress it once real items land.
 *
 * This lives next to `usePlaylistIntermissionPhase` on purpose: the hook owns
 * phase transitions and dismissal; this file owns the client-side rule for
 * when an already-visible overlay should be cut short. Keeping them separate
 * avoids mixing "what phase are we in" with "should we actually render it".
 */
export function useOverlayInterruptSuppression(input: {
  phase: PlaylistPhase;
  playlistKey: string;
  playContextSignature: string;
  hasItems: boolean;
}): boolean {
  const { phase, playlistKey, playContextSignature, hasItems } = input;
  const sigRef = useRef<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const suppress =
    phase !== 'artwork' &&
    keyRef.current === playlistKey &&
    sigRef.current !== null &&
    sigRef.current !== playContextSignature;

  useEffect(() => {
    if (phase === 'artwork') {
      sigRef.current = null;
      keyRef.current = null;
      return;
    }
    if (keyRef.current !== null && keyRef.current !== playlistKey) {
      // New playlist instance — drop stale baseline so the fresh overlay runs.
      sigRef.current = null;
      keyRef.current = null;
    }
    if (sigRef.current === null && hasItems) {
      sigRef.current = playContextSignature;
      keyRef.current = playlistKey;
    }
  }, [phase, playlistKey, playContextSignature, hasItems]);

  return suppress;
}
