import type { DP1IntermissionNote, DP1Item } from '@/models/dp1.model';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type PlaylistPhase = 'playlistIntro' | 'itemIntro' | 'artwork';

/**
 * Manages per-session dismissal of playlist and item intros.
 *
 * Contract (clarified by product owner):
 * - `loop-one`: once dismissed, DO NOT replay. The same slot / occurrence
 *   will keep re-ticking under `updateIndex` without rotating `playlistKey`
 *   and without the current-occurrence key changing, so the dismissal
 *   simply stays in place.
 * - `loop-playlist`: each wrap back to a noted slot replays the note
 *   normally. This is achieved by clearing a dismissal as soon as the
 *   player moves AWAY from it (occurrence key changes for items,
 *   `currentIndex > 0` for the playlist-level welcome). On wrap back, the
 *   dismissal is already null so the gate re-opens.
 * - `loop-none`: plays through, never wraps; dismissal is immaterial after
 *   advance.
 *
 * Resets on `playlistKey` change (new playlist instance — refresh/shuffle
 * key rotation, displayPlaylist with new id, moveToArtwork explicit jump,
 * cast-clear). The client owns rotation; this hook only owns the reaction.
 *
 * Midstream boot (session starts at `currentIndex > 0`) is handled by the
 * same "leave-slot-0 clears welcome dismissal" rule: dismissal is already
 * null, `currentIndex > 0` makes the effect a no-op, and the welcome is
 * gated closed by `currentIndex === 0` anyway. When a later loop-playlist
 * wrap lands on slot 0 the welcome will show, which matches the
 * "display again normally" product contract.
 */
function useDismissalLifecycle(input: {
  playlistKey: string;
  currentIndex: number;
  currentOccurrenceKey: string | null;
  playlistIntroDismissedForId: string | null;
  lastDismissedItemOccurrence: string | null;
  setPlaylistIntroDismissedForId: (id: string | null) => void;
  setLastDismissedItemOccurrence: (id: string | null) => void;
}): void {
  const {
    playlistKey,
    currentIndex,
    currentOccurrenceKey,
    playlistIntroDismissedForId,
    lastDismissedItemOccurrence,
    setPlaylistIntroDismissedForId,
    setLastDismissedItemOccurrence,
  } = input;
  const prevPlaylistKeyRef = useRef(playlistKey);

  useLayoutEffect(() => {
    if (prevPlaylistKeyRef.current !== playlistKey) {
      prevPlaylistKeyRef.current = playlistKey;
      setPlaylistIntroDismissedForId(null);
      setLastDismissedItemOccurrence(null);
    }
  }, [
    playlistKey,
    setLastDismissedItemOccurrence,
    setPlaylistIntroDismissedForId,
  ]);

  // Loop-playlist wrap replay, welcome edition: once the player has moved
  // past slot 0, forget any dismissal for the welcome so a future return to
  // slot 0 (loop-playlist wrap, or an explicit jump not routed through the
  // moveToArtwork bypass) will show it again. Loop-one never reaches the
  // `> 0` branch when pinned at slot 0, so dismissal persists there.
  useLayoutEffect(() => {
    if (currentIndex > 0 && playlistIntroDismissedForId !== null) {
      setPlaylistIntroDismissedForId(null);
    }
  }, [currentIndex, playlistIntroDismissedForId, setPlaylistIntroDismissedForId]);

  // Loop-playlist wrap replay, item edition: as soon as the live occurrence
  // key diverges from the one we remembered as "dismissed", drop the memory.
  // On a later wrap back, the key matches again but the memory is null so
  // the gate re-opens. Loop-one keeps the occurrence key pinned and never
  // trips this branch.
  useLayoutEffect(() => {
    if (
      lastDismissedItemOccurrence !== null &&
      currentOccurrenceKey !== lastDismissedItemOccurrence
    ) {
      setLastDismissedItemOccurrence(null);
    }
  }, [
    currentOccurrenceKey,
    lastDismissedItemOccurrence,
    setLastDismissedItemOccurrence,
  ]);
}

/**
 * Sequences DP-1 Playlist Extension intermissions (session-only):
 * optional playlist-level note before the first item, then optional per-item
 * notes before each item's artwork. Dismissal is remembered in-memory only;
 * reload shows intermissions again.
 *
 * **Playlist note gating**: Only shown when `currentIndex === 0` to enforce
 * "before the first item" semantics. The dismissal is scoped to the current
 * run at slot 0 — advancing past slot 0 forgets the dismissal so a later
 * loop-playlist wrap replays the welcome. Midstream boots at
 * `currentIndex > 0` therefore never see the welcome on the boot render
 * and, for `loop-playlist`, will see it on the first wrap to slot 0.
 *
 * Item dismissal uses an **occurrence key** `${itemId}-${slotIndex}` (both
 * stringified) so duplicate IDs in different slots get independent intros.
 * Scope is "this occurrence, while we are on it": as soon as the live
 * occurrence key diverges, the memory is cleared so a future wrap replays.
 * Changing this format is a behavior change — update tests if you adjust it.
 *
 * **`playlistKey` change** clears all dismissal so a new playlist instance
 * can show its intros again. Clients must only rotate on true identity
 * changes (fresh `displayPlaylist` id, queued cross-list promotion, cast
 * clear, explicit `moveToArtwork`). Same-id re-emission must NOT rotate or
 * the "no replay on loop-one" contract breaks.
 *
 * **Loop semantics**:
 * - `loop-one`: same occurrence / same slot re-ticks under `updateIndex`.
 *   The occurrence key never moves and the welcome can never transition
 *   past slot 0, so dismissal persists. No replay.
 * - `loop-playlist`: wrap-through dismisses are forgotten as the player
 *   leaves the dismissed slot / occurrence, so the wrap-back renders them
 *   again. Replays normally.
 *
 * **Interrupt on context change** (mid-overlay refresh/shuffle/queued
 * promotion) is owned by the client rendering layer, not this hook: the
 * client suppresses the overlay when the playback-context signature shifts
 * while an overlay is up.
 */
export function usePlaylistIntermissionPhase(input: {
  playlistKey: string;
  playlistLevelNote: DP1IntermissionNote | undefined;
  currentItem: DP1Item | undefined;
  currentIndex: number;
}): {
  phase: PlaylistPhase;
  activeNote: DP1IntermissionNote | undefined;
  completePlaylistIntro: () => void;
  completeItemIntro: () => void;
} {
  const [playlistIntroDismissedForId, setPlaylistIntroDismissedForId] =
    useState<string | null>(null);
  // Track item dismissal by occurrence (itemId-index) to support playlists
  // where the same item ID appears multiple times in different slots.
  const [lastDismissedItemOccurrence, setLastDismissedItemOccurrence] =
    useState<string | null>(null);

  const currentItemId = input.currentItem?.id;
  const itemNote = input.currentItem?.note;
  const hasItemNote =
    itemNote !== undefined && itemNote.text.trim().length > 0;
  // Occurrence key combines item ID and index so duplicate IDs in different
  // slots (e.g., [A, B, A]) each get their own intro.
  const currentOccurrenceKey =
    currentItemId !== undefined && input.currentIndex >= 0
      ? `${currentItemId}-${String(input.currentIndex)}`
      : null;

  useDismissalLifecycle({
    playlistKey: input.playlistKey,
    currentIndex: input.currentIndex,
    currentOccurrenceKey,
    playlistIntroDismissedForId,
    lastDismissedItemOccurrence,
    setPlaylistIntroDismissedForId,
    setLastDismissedItemOccurrence,
  });

  const hasPlaylistNote =
    input.playlistLevelNote !== undefined &&
    input.playlistLevelNote.text.trim().length > 0;
  const showPlaylistIntro =
    hasPlaylistNote &&
    playlistIntroDismissedForId !== input.playlistKey &&
    input.currentIndex === 0;

  const itemGateOpen =
    currentOccurrenceKey !== null &&
    currentOccurrenceKey !== lastDismissedItemOccurrence;
  const showItemIntro = !showPlaylistIntro && hasItemNote && itemGateOpen;

  const completePlaylistIntro = useCallback(() => {
    setPlaylistIntroDismissedForId(input.playlistKey);
  }, [input.playlistKey]);

  const completeItemIntro = useCallback(() => {
    if (currentOccurrenceKey !== null) {
      setLastDismissedItemOccurrence(currentOccurrenceKey);
    }
  }, [currentOccurrenceKey]);

  let phase: PlaylistPhase = 'artwork';
  let activeNote: DP1IntermissionNote | undefined;

  if (showPlaylistIntro) {
    phase = 'playlistIntro';
    activeNote = input.playlistLevelNote;
  } else if (showItemIntro) {
    phase = 'itemIntro';
    activeNote = itemNote;
  }

  return {
    phase,
    activeNote,
    completePlaylistIntro,
    completeItemIntro,
  };
}
