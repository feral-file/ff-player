'use client';

/* eslint-disable max-lines*/
import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import { PlaylistIntermission } from '@/components/playlist/PlaylistIntermission';
import { useAppContext } from '@/context/AppContext';
import { useOverlayInterruptSuppression } from '@/hooks/useOverlayInterruptSuppression';
import { usePlaylistIntroBypassOnMove } from '@/hooks/usePlaylistIntroBypassOnMove';
import {
  usePlaylistIntermissionPhase,
  type PlaylistPhase,
} from '@/hooks/usePlaylistIntermissionPhase';
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import {
  defaultDP1DisplayPreference,
  DP1DisplayPreference,
  DP1Defaults,
  type DP1IntermissionNote,
  DP1Item,
} from '@/models/dp1.model';
import {
  DP1_DEFAULT_INTERMISSION_SECONDS,
  NO_DURATION_VALUE,
} from '@/constants';
import { canvasService } from '@/services/CanvasService';
import { DP1Service } from '@/services/DP1Service';
import {
  normalizePlaylistIndex,
  resolveQueuedPlaylistNextIndex,
  resolveSequentialPlaylistAdvance,
  shouldApplyQueuedPlaylistOnShuffleOrRefresh,
  shouldResumeSlotTimerAfterSetLoop,
} from '@/utils/playlist';
import { coerceLoopMode } from '@/utils/loopMode';
import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function reportPlaylistDisplayPreferenceError(
  phase: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const message = `[PlaylistClient] Error handling item display preference (${phase})`;
  console.error(
    message,
    error instanceof Error ? error.message : String(error)
  );
  if (error instanceof Error) {
    Sentry.captureException(error, {
      extra: { phase, ...extra },
    });
  } else {
    Sentry.captureMessage(message, {
      extra: {
        error: String(error),
        phase,
        ...extra,
      },
    });
  }
}

export function getDP1IntermissionDurationSeconds(
  note: DP1IntermissionNote
): number {
  const d = note.duration;
  if (d === undefined || d <= 0 || !Number.isFinite(d)) {
    return DP1_DEFAULT_INTERMISSION_SECONDS;
  }
  return d;
}

/**
 * Session-scoped key for intermission dismissal (`usePlaylistIntermissionPhase`).
 * Shares one monotonic epoch ref between `displayPlaylist` and queued promotion.
 */
export function nextPlaylistIntermissionKey(
  playlistId: string | undefined,
  epochRef: { current: number }
): string {
  const epoch = epochRef.current;
  epochRef.current = epoch + 1;
  if (playlistId) {
    return `${playlistId}_${String(epoch)}`;
  }
  return `__session_${String(epoch)}`;
}

const INITIAL_PLAYLIST_KEY = '__initial__';

// eslint-disable-next-line max-lines-per-function
export default function PlaylistClient() {
  const castInfo = useAppContext().context.castInfo;

  const [playlist, setPlaylist] = useState<DP1Item[]>([]);
  const [playlistDefaultsSettings, setPlaylistDefaultsSettings] =
    useState<DP1Defaults | null>(null);
  const [currentItemDisplayPreference, setCurrentItemDisplayPreference] =
    useState<DP1DisplayPreference | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  // `playlistKey` is the single authority for intermission lifecycle resets.
  // Sanctioned rotations (keep in sync with callers of `setPlaylistKey`):
  //   1. `displayPlaylist` with items AND id change     → fresh key.
  //   2. `displayPlaylist` with no items                → reset to INITIAL.
  //   3. queued promotion, keepCurrent=false            → slot advance.
  //   4. queued promotion, keepCurrent=true + id change → cross-list.
  //   5. castInfo cleared                               → reset to INITIAL.
  //   6. `moveToArtwork`                                → explicit jump.
  // Anything else (loop/shuffle toggle, `updateIndex`, same-id republish,
  // display-setting update) MUST NOT rotate: clearing dismissal on those
  // paths would replay a dismissed intro and violate loop-one's contract.
  const [playlistKey, setPlaylistKey] = useState<string>(INITIAL_PLAYLIST_KEY);
  const playlistEpochRef = useRef(0);
  // Playlist id that the **current** `playlistKey` was minted for. Lets
  // queued-promotion paths detect when a queued refresh/shuffle actually swaps
  // playlist identity (new `playlist.id`) so we can rotate `playlistKey` and
  // let the new playlist's own intros show — even under `keepCurrent=true`,
  // which would otherwise inherit the previous playlist's dismissal state.
  // `canvasService.getCastInfo()` cannot be used for this comparison because
  // callers often update `castInfo` before the dismiss flush runs; this ref is
  // the component-local source of truth for "which playlist does our current
  // dismissal/phase state belong to".
  const currentPlaylistIdRef = useRef<string | undefined>(undefined);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const currentItemRef = useRef<DP1Item>();
  const currentIndexRef = useRef<number>(-1);
  const playlistRef = useRef<DP1Item[]>([]);
  const playlistLengthRef = useRef<number>(0);
  const loopModeRef = useRef<LoopMode>(LoopMode.playlist);
  const holdAfterFinalSlotRef = useRef(false);
  const intermissionOverlayRef = useRef(false);

  currentIndexRef.current = currentIndex;
  playlistRef.current = playlist;
  playlistLengthRef.current = playlist.length;

  const safePlaylistIndex =
    playlist.length > 0 && currentIndex >= 0
      ? normalizePlaylistIndex(currentIndex, playlist.length)
      : -1;
  const currentPlaylistItem =
    safePlaylistIndex >= 0 ? playlist[safePlaylistIndex] : undefined;

  const intermission = usePlaylistIntermissionPhase({
    playlistKey,
    playlistLevelNote: castInfo?.playlist?.note,
    currentItem: currentPlaylistItem,
    currentIndex: safePlaylistIndex,
  });

  // Owned playback state only (slot index + length + item ordering). Omits
  // `castCommand` so loop/shuffle toggles don't cancel an intermission, and
  // `castInfo.playlist.id` because it lags component state across the
  // Provider boundary (playlist identity already rotates `playlistKey`).
  const playContextSignature = useMemo(() => {
    const itemsSig = playlist.map(i => i.id).join('|');
    return `${String(safePlaylistIndex)}|${String(playlist.length)}|${itemsSig}`;
  }, [playlist, safePlaylistIndex]);

  const suppressOverlay = useOverlayInterruptSuppression({
    phase: intermission.phase,
    playlistKey,
    playContextSignature,
    hasItems: playlist.length > 0,
  });

  const effectivePhase: PlaylistPhase = suppressOverlay
    ? 'artwork'
    : intermission.phase;

  intermissionOverlayRef.current = effectivePhase !== 'artwork';

  const markMoveToArtworkIntroBypass = usePlaylistIntroBypassOnMove({
    playlistKey,
    completePlaylistIntro: intermission.completePlaylistIntro,
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const handleItemDisplayPreference = useCallback(
    async (dp1Item: DP1Item) => {
      const activeItemId = dp1Item.id;
      const activeRef = dp1Item.ref;

      try {
        // 4) Playlist defaults.display (lowest priority)
        const base: DP1DisplayPreference = {
          ...defaultDP1DisplayPreference,
          ...(playlistDefaultsSettings?.display ?? {}),
        };

        // 3) Content loaded from item.ref
        let refDisplay: DP1DisplayPreference | undefined;
        try {
          if (dp1Item.ref) {
            // TODO: Implement ref hash verification
            const manifest = await DP1Service.getItemRef(dp1Item.ref);
            refDisplay = manifest?.controls?.display;
          }
        } catch (error: unknown) {
          reportPlaylistDisplayPreferenceError('getItemRef', error, {
            ref: dp1Item.ref,
            itemId: dp1Item.id,
          });
          // Ref load failed; continue merge without manifest display.
        }

        // 2) Item override.display (medium priority)
        let overriddenDisplay: DP1DisplayPreference | undefined;
        if (dp1Item.override?.display) {
          overriddenDisplay = dp1Item.override.display;
        }

        // 1) Item display (highest priority)
        const merged: DP1DisplayPreference = {
          ...base,
          ...(refDisplay ?? {}),
          ...(overriddenDisplay ?? {}),
          ...(dp1Item.display ?? {}),
        };

        const currentItem = currentItemRef.current;
        if (!currentItem) {
          return;
        }
        if (currentItem.id === activeItemId && currentItem.ref === activeRef) {
          setCurrentItemDisplayPreference(merged);
        }
      } catch (error: unknown) {
        reportPlaylistDisplayPreferenceError(
          'mergeOrApplyDisplayPreference',
          error,
          { itemId: activeItemId, ref: activeRef }
        );
        const currentItem = currentItemRef.current;
        if (!currentItem) {
          return;
        }
        if (currentItem.id === activeItemId && currentItem.ref === activeRef) {
          setCurrentItemDisplayPreference(defaultDP1DisplayPreference);
        }
      }
    },
    [playlistDefaultsSettings]
  );

  const publishCurrentIndex = useCallback((index: number) => {
    const currentCastInfo = canvasService.getCastInfo();
    if (!currentCastInfo) {
      return;
    }

    canvasService.setCastInfo({
      ...currentCastInfo,
      castCommand: CastCommand.updateIndex,
      index,
    });
  }, []);

  const applyQueuedPlaylistIfExists = useCallback(
    (
      targetIndex?: number,
      keepCurrent = false
    ): { applied: boolean; rotatedPlaylistKey?: string } => {
      if (!canvasService.hasQueuedPlaylistPending()) {
        return { applied: false };
      }

      // Items are owned by CanvasService — no duplicate storage needed.
      const queuedPlaylist = canvasService.getQueuedPlaylistItems();
      if (!queuedPlaylist?.length) {
        canvasService.clearQueuedPlaylistPending();
        return { applied: false };
      }

      holdAfterFinalSlotRef.current = false;

      const hasDeferredRefresh = canvasService.hasDeferredRefreshPlaylist();
      const currentCastInfo = canvasService.getCastInfo();
      const nextIndex = resolveQueuedPlaylistNextIndex({
        targetIndex,
        queuedPlaylist,
        previousItems: currentCastInfo?.playlist?.items,
        hasDeferredRefresh,
        currentItemId: currentItemRef.current?.id,
        keepCurrent,
      });

      setPlaylist(queuedPlaylist);
      setCurrentIndex(nextIndex);

      // consumeDeferredRefreshPlaylist atomically promotes the deferred refresh
      // onto castInfo so getStatus reflects the new list from the first frame.
      // Queued refresh/shuffle only changes playlist items and index; defaults
      // stay owned by the active playlist contract and are intentionally left as-is.
      const consumed = canvasService.consumeDeferredRefreshPlaylist(nextIndex);
      if (!consumed) {
        canvasService.clearQueuedPlaylistPending();
        publishCurrentIndex(nextIndex);
      }

      // Rotate `playlistKey` when the promoted list advances the slot
      // (keepCurrent=false), OR when playlist identity changed even under
      // keepCurrent=true. The identity branch is what lets a queued refresh
      // that promotes a *different* playlist show its own intro on dismiss —
      // without it, the hook inherits the previous playlist's dismissal and
      // silently skips the new intro. Comparison uses `currentPlaylistIdRef`,
      // not `canvasService.getCastInfo()`, because callers typically update
      // `castInfo` to the new playlist *before* this flush runs, which would
      // hide the identity change from a canvasService-side comparison.
      //
      // The rotated key is surfaced so callers that own explicit-navigation
      // semantics (notably `moveToArtwork`) can pair it with
      // `markMoveToArtworkIntroBypass` on the same commit. Without that
      // pairing, a queued-applied moveToArtwork re-arms the playlist welcome
      // at the destination slot 0 and violates the explicit-jump contract.
      const updatedCastInfo = canvasService.getCastInfo();
      const newPlaylistId = updatedCastInfo?.playlist?.id;
      const identityChanged = currentPlaylistIdRef.current !== newPlaylistId;
      if (!keepCurrent || identityChanged) {
        currentPlaylistIdRef.current = newPlaylistId;
        const rotatedKey = nextPlaylistIntermissionKey(
          newPlaylistId,
          playlistEpochRef
        );
        setPlaylistKey(rotatedKey);
        return { applied: true, rotatedPlaylistKey: rotatedKey };
      }

      return { applied: true };
    },
    [publishCurrentIndex]
  );

  const handleIntermissionComplete = useCallback(
    (originalCallback: () => void) => {
      originalCallback();

      // After intermission completes, flush any queued updates. Refresh/shuffle
      // commands arriving during the overlay are otherwise stranded until an
      // unrelated timer or hold-release event. keepCurrent=true stays on the
      // item whose intro just dismissed (the intro represents that item).
      if (canvasService.hasQueuedPlaylistPending()) {
        applyQueuedPlaylistIfExists(undefined, true);
      }
    },
    [applyQueuedPlaylistIfExists]
  );

  const scheduleCurrentItemTimer = useCallback(
    function scheduleCurrentItemTimer(
      index: number,
      snapshot: DP1Item[]
    ): void {
      clearTimer();

      if (!snapshot.length) {
        return;
      }

      const normalizedIndex = normalizePlaylistIndex(index, snapshot.length);
      const currentItem = snapshot[normalizedIndex];

      const duration = currentItem.duration ?? 0;
      if (duration <= 0 || duration >= NO_DURATION_VALUE) {
        return;
      }

      timerRef.current = setTimeout(() => {
        holdAfterFinalSlotRef.current = false;
        // The timeout is firing now, so the previous handle is no longer active.
        // Clearing it lets later loop-mode changes detect a true "held on final
        // artwork" state after repeat-off stops progression.
        timerRef.current = undefined;

        if (loopModeRef.current === LoopMode.one) {
          // Apply queued playlist if any, staying on the same artwork.
          // keepCurrent=true: find the current item in the new list and loop it,
          // falling back to index 0 if the item was removed by a deferred refresh.
          // After apply, React effect reschedules the timer with the new playlist.
          if (applyQueuedPlaylistIfExists(undefined, true).applied) {
            return;
          }
          publishCurrentIndex(normalizedIndex);
          scheduleCurrentItemTimer(normalizedIndex, snapshot);
          return;
        }

        const queuedResult = applyQueuedPlaylistIfExists();
        if (queuedResult.applied) {
          return;
        }

        const nextIndex = resolveSequentialPlaylistAdvance({
          currentIndex: normalizedIndex,
          playlistLength: snapshot.length,
          loopMode: loopModeRef.current,
        });
        if (nextIndex === null) {
          // Repeat-off holds the final artwork on screen until another command
          // changes playback. Do not wrap or reschedule from this slot.
          if (
            loopModeRef.current === LoopMode.none &&
            normalizedIndex === snapshot.length - 1
          ) {
            holdAfterFinalSlotRef.current = true;
          }
          return;
        }

        // Single-item playlist: nextIndex wraps back to the same position.
        // setCurrentIndex would be a no-op and React would not re-run the
        // scheduling effect. Reschedule directly to keep the loop alive.
        if (nextIndex === normalizedIndex) {
          publishCurrentIndex(nextIndex);
          scheduleCurrentItemTimer(nextIndex, snapshot);
          return;
        }

        setCurrentIndex(nextIndex);
        publishCurrentIndex(nextIndex);
      }, duration * 1000);
    },
    [applyQueuedPlaylistIfExists, clearTimer, publishCurrentIndex]
  );

  useEffect(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      holdAfterFinalSlotRef.current = false;
      clearTimer();
      return;
    }

    const normalizedIndex = normalizePlaylistIndex(
      currentIndex,
      playlist.length
    );
    const currentItem = playlist[normalizedIndex];
    // Always keep currentItemRef in sync with the active item, even during
    // note overlays, so queued refresh/shuffle anchors against the correct item.
    currentItemRef.current = currentItem;

    if (effectivePhase !== 'artwork') {
      clearTimer();
      return;
    }

    void handleItemDisplayPreference(currentItem);
    setCastPreviewURL(currentItem.source);
    scheduleCurrentItemTimer(normalizedIndex, playlist);

    return () => {
      clearTimer();
    };
  }, [
    currentIndex,
    playlist,
    playlistDefaultsSettings,
    clearTimer,
    handleItemDisplayPreference,
    effectivePhase,
    scheduleCurrentItemTimer,
  ]);

  // eslint-disable-next-line max-lines-per-function
  useEffect(() => {
    if (!castInfo) {
      clearTimer();
      holdAfterFinalSlotRef.current = false;
      currentItemRef.current = undefined;
      loopModeRef.current = LoopMode.playlist;
      setPlaylist([]);
      setCurrentIndex(-1);
      setPlaylistDefaultsSettings(null);
      setCurrentItemDisplayPreference(null);
      setCastPreviewURL(null);
      setPlaylistKey(INITIAL_PLAYLIST_KEY);
      currentPlaylistIdRef.current = undefined;
      playlistEpochRef.current = 0;
      return;
    }

    switch (castInfo.castCommand) {
      case CastCommand.displayPlaylist: {
        holdAfterFinalSlotRef.current = false;
        loopModeRef.current = coerceLoopMode(castInfo.loopMode);
        if (castInfo.playlist?.items?.length) {
          // Rotate only on a true identity change. Same-id re-emissions
          // (heartbeat, reconnect, republish) must preserve dismissal or
          // loop-one will replay a dismissed intro on the next tick.
          const incomingId = castInfo.playlist.id;
          if (incomingId !== currentPlaylistIdRef.current) {
            currentPlaylistIdRef.current = incomingId;
            setPlaylistKey(
              nextPlaylistIntermissionKey(incomingId, playlistEpochRef)
            );
          }
          setPlaylistDefaultsSettings(castInfo.playlist.defaults ?? null);
          setPlaylist(
            castInfo.playlist.items.map(item => ({
              ...item,
              duration: item.duration ?? NO_DURATION_VALUE,
            }))
          );
          const startIndex = normalizePlaylistIndex(
            castInfo.index ?? 0,
            castInfo.playlist.items.length
          );
          setCurrentIndex(startIndex);
        } else {
          setPlaylist([]);
          setCurrentIndex(-1);
          setPlaylistDefaultsSettings(null);
          setCurrentItemDisplayPreference(null);
          setCastPreviewURL(null);
          setPlaylistKey(INITIAL_PLAYLIST_KEY);
          currentPlaylistIdRef.current = undefined;
        }
        break;
      }

      case CastCommand.refreshPlaylist:
      case CastCommand.setShuffle: {
        if (castInfo.playlist?.items?.length) {
          if (
            shouldApplyQueuedPlaylistOnShuffleOrRefresh({
              currentIndex: currentIndexRef.current,
              playlistLength: playlistLengthRef.current,
              hasQueuedPlaylistPending:
                canvasService.hasQueuedPlaylistPending(),
              holdAfterFinalSlot: holdAfterFinalSlotRef.current,
            })
          ) {
            applyQueuedPlaylistIfExists(castInfo.index);
          }
          break;
        }

        holdAfterFinalSlotRef.current = false;
        clearTimer();
        currentItemRef.current = undefined;
        setPlaylist([]);
        setCurrentIndex(-1);
        setPlaylistDefaultsSettings(null);
        setCurrentItemDisplayPreference(null);
        setCastPreviewURL(null);
        break;
      }

      case CastCommand.moveToArtwork:
      case CastCommand.updateIndex: {
        if (castInfo.index === undefined) {
          break;
        }

        if (canvasService.hasQueuedPlaylistPending()) {
          const queuedResult = applyQueuedPlaylistIfExists(castInfo.index);
          if (queuedResult.applied) {
            // `applyQueuedPlaylistIfExists` already rotated `playlistKey` and
            // cleared dismissal, which is enough for item intros (spec cases
            // 1 and 2). Case 3 — a playlist-level welcome showing while the
            // explicit jump targets slot 0 — still needs the bypass, because
            // rotation alone re-arms the welcome and the "leave slot 0"
            // auto-clear never fires for a slot-0 destination. Mirror the
            // non-queued branch below so both paths honor the same explicit-
            // navigation contract.
            if (
              castInfo.castCommand === CastCommand.moveToArtwork &&
              queuedResult.rotatedPlaylistKey !== undefined
            ) {
              markMoveToArtworkIntroBypass(queuedResult.rotatedPlaylistKey);
            }
            break;
          }
        }

        holdAfterFinalSlotRef.current = false;
        if (castInfo.playlist?.items?.length) {
          setCurrentIndex(
            normalizePlaylistIndex(
              castInfo.index,
              castInfo.playlist.items.length
            )
          );
        } else {
          setCurrentIndex(castInfo.index);
        }

        // moveToArtwork is an EXPLICIT jump: rotate so suppression baseline
        // and dismissal both reset, so destination's item intro renders (spec
        // cases 1 and 2). The bypass hook covers case 3: when the target is
        // slot 0 mid playlist-intro, rotation alone would re-arm the welcome,
        // so we dismiss the welcome explicitly on the new key. `updateIndex`
        // stays on the non-rotating branch (republished every tick / loop).
        if (castInfo.castCommand === CastCommand.moveToArtwork) {
          const targetId = castInfo.playlist?.id;
          const rotatedKey = nextPlaylistIntermissionKey(
            targetId,
            playlistEpochRef
          );
          currentPlaylistIdRef.current = targetId;
          markMoveToArtworkIntroBypass(rotatedKey);
          setPlaylistKey(rotatedKey);
        }
        break;
      }

      case CastCommand.setLoop: {
        const nextLoopMode = coerceLoopMode(castInfo.loopMode);
        const activePlaylist = playlistRef.current;
        const shouldResume = shouldResumeSlotTimerAfterSetLoop({
          nextLoopMode,
          holdAfterFinalSlot: holdAfterFinalSlotRef.current,
          currentIndex: currentIndexRef.current,
          playlistLength: activePlaylist.length,
        });

        loopModeRef.current = nextLoopMode;

        if (shouldResume && !intermissionOverlayRef.current) {
          // Leaving repeat-off while holding the last artwork should restart that
          // artwork's slot timer so playback can continue from the held frame.
          holdAfterFinalSlotRef.current = false;
          scheduleCurrentItemTimer(currentIndexRef.current, activePlaylist);
        }
        break;
      }
    }
  }, [
    applyQueuedPlaylistIfExists,
    castInfo,
    clearTimer,
    markMoveToArtworkIntroBypass,
    scheduleCurrentItemTimer,
  ]);

  // Render gated on `effectivePhase` (not `intermission.phase`): a suppressed
  // overlay must not leak through while ArtworkPlayer waits on its first
  // `currentItemDisplayPreference`, otherwise the JSX used to fall through to
  // the overlay branch because `activeNote` is still truthy on the same tick.
  const activeNote = intermission.activeNote;

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {effectivePhase !== 'artwork' && activeNote ? (
        <PlaylistIntermission
          key={`${intermission.phase}-${playlistKey}-${currentPlaylistItem?.id ?? 'none'}`}
          durationSeconds={getDP1IntermissionDurationSeconds(activeNote)}
          text={activeNote.text}
          onComplete={() => {
            handleIntermissionComplete(
              intermission.phase === 'playlistIntro'
                ? intermission.completePlaylistIntro
                : intermission.completeItemIntro
            );
          }}
        />
      ) : currentItemDisplayPreference ? (
        <ArtworkPlayer
          previewURL={castPreviewURL ?? ''}
          displayPreferences={currentItemDisplayPreference}
        />
      ) : null}
    </div>
  );
}
