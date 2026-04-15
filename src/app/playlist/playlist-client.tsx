'use client';

import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import NoteCard from '@/components/note-card/NoteCard';
import { useAppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import {
  defaultDP1DisplayPreference,
  DP1DisplayPreference,
  DP1Defaults,
  DP1Item,
  DP1Note,
} from '@/models/dp1.model';
import { NO_DURATION_VALUE } from '@/constants';
import { canvasService } from '@/services/CanvasService';
import { DP1Service } from '@/services/DP1Service';
import {
  normalizePlaylistIndex,
  resolveQueuedPlaylistNextIndex,
} from '@/utils/playlist';
import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';

const validLoopModes = new Set<string>(Object.values(LoopMode));

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

function getNoteDurationMs(note: DP1Note): number {
  return (note.duration ?? 20) * 1000;
}

export default function PlaylistClient() {
  const { context } = useAppContext();
  const castInfo = context.castInfo;

  const [playlist, setPlaylist] = useState<DP1Item[]>([]);
  const [playlistDefaultsSettings, setPlaylistDefaultsSettings] =
    useState<DP1Defaults | null>(null);
  const [currentItemDisplayPreference, setCurrentItemDisplayPreference] =
    useState<DP1DisplayPreference | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const [playlistNote, setPlaylistNote] = useState<DP1Note | null>(null);
  const [activeNote, setActiveNote] = useState<DP1Note | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const noteTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const hasShownPlaylistNoteRef = useRef<boolean>(false);
  const currentItemRef = useRef<DP1Item>();
  const currentIndexRef = useRef<number>(-1);
  const playlistLengthRef = useRef<number>(0);
  const loopModeRef = useRef<LoopMode>(LoopMode.playlist);

  currentIndexRef.current = currentIndex;
  playlistLengthRef.current = playlist.length;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const clearNoteTimeout = useCallback(() => {
    if (noteTimeoutRef.current) {
      clearTimeout(noteTimeoutRef.current);
      noteTimeoutRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      clearNoteTimeout();
    };
  }, [clearTimer, clearNoteTimeout]);

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
    (targetIndex?: number, keepCurrent = false): { applied: boolean } => {
      if (!canvasService.hasQueuedPlaylistPending()) {
        return { applied: false };
      }

      // Items are owned by CanvasService — no duplicate storage needed.
      const queuedPlaylist = canvasService.getQueuedPlaylistItems();
      if (!queuedPlaylist?.length) {
        canvasService.clearQueuedPlaylistPending();
        return { applied: false };
      }

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

      return { applied: true };
    },
    [publishCurrentIndex]
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

        const nextIndex = normalizePlaylistIndex(
          normalizedIndex + 1,
          snapshot.length
        );

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

  /**
   * After intermission notes finish, start the artwork display and per-item timer.
   * Keeps the same scheduling model as the no-notes path (setTimeout per item duration).
   */
  const beginPlaybackAfterNotes = useCallback(
    (normalizedIndex: number, snapshot: DP1Item[]) => {
      clearNoteTimeout();
      setActiveNote(null);
      const n = normalizePlaylistIndex(normalizedIndex, snapshot.length);
      const item = snapshot[n];
      currentItemRef.current = item;
      void handleItemDisplayPreference(item);
      setCastPreviewURL(item.source);
      scheduleCurrentItemTimer(n, snapshot);
    },
    [clearNoteTimeout, handleItemDisplayPreference, scheduleCurrentItemTimer]
  );

  /**
   * Shows playlist-level and item-level intermission notes sequentially before artwork.
   * Pauses the artwork duration timer until notes complete (clearTimer while notes run).
   */
  const showNotesBeforeItem = useCallback(
    (notes: DP1Note[], normalizedIndex: number, snapshot: DP1Item[]) => {
      const run = (queue: DP1Note[]) => {
        if (queue.length === 0) {
          beginPlaybackAfterNotes(normalizedIndex, snapshot);
          return;
        }
        const note = queue[0];
        const remaining = queue.slice(1);
        clearTimer();
        clearNoteTimeout();
        setCastPreviewURL(null);
        setActiveNote(note);
        const durationMs = getNoteDurationMs(note);
        noteTimeoutRef.current = setTimeout(() => {
          run(remaining);
        }, durationMs);
      };
      run(notes);
    },
    [beginPlaybackAfterNotes, clearTimer, clearNoteTimeout]
  );

  useEffect(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      clearTimer();
      clearNoteTimeout();
      setActiveNote(null);
      return;
    }

    const normalizedIndex = normalizePlaylistIndex(
      currentIndex,
      playlist.length
    );
    const currentItem = playlist[normalizedIndex];
    currentItemRef.current = currentItem;

    const notesToShow: DP1Note[] = [];
    if (
      normalizedIndex === 0 &&
      !hasShownPlaylistNoteRef.current &&
      playlistNote
    ) {
      notesToShow.push(playlistNote);
      hasShownPlaylistNoteRef.current = true;
    }
    if (currentItem.note) {
      notesToShow.push(currentItem.note);
    }

    if (notesToShow.length > 0) {
      showNotesBeforeItem(notesToShow, normalizedIndex, playlist);
      return () => {
        clearTimer();
        clearNoteTimeout();
      };
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
    playlistNote,
    clearTimer,
    clearNoteTimeout,
    handleItemDisplayPreference,
    scheduleCurrentItemTimer,
    showNotesBeforeItem,
  ]);

  useEffect(() => {
    if (!castInfo) {
      clearTimer();
      clearNoteTimeout();
      currentItemRef.current = undefined;
      loopModeRef.current = LoopMode.playlist;
      hasShownPlaylistNoteRef.current = false;
      setPlaylist([]);
      setCurrentIndex(-1);
      setPlaylistDefaultsSettings(null);
      setPlaylistNote(null);
      setActiveNote(null);
      setCurrentItemDisplayPreference(null);
      setCastPreviewURL(null);
      return;
    }

    console.log(
      '[PlaylistClient] process cast info',
      JSON.stringify(castInfo.castCommand)
    );

    switch (castInfo.castCommand) {
      case CastCommand.displayPlaylist: {
        if (castInfo.playlist?.items?.length) {
          hasShownPlaylistNoteRef.current = false;
          setPlaylistNote(castInfo.playlist.note ?? null);
          setPlaylistDefaultsSettings(castInfo.playlist.defaults ?? null);
          setPlaylist(
            castInfo.playlist.items.map(item => ({
              ...item,
              duration: item.duration ?? NO_DURATION_VALUE,
            }))
          );
          setCurrentIndex(
            normalizePlaylistIndex(
              castInfo.index ?? 0,
              castInfo.playlist.items.length
            )
          );
        } else {
          setPlaylist([]);
          setCurrentIndex(-1);
          setPlaylistDefaultsSettings(null);
          setPlaylistNote(null);
          setActiveNote(null);
          setCurrentItemDisplayPreference(null);
          setCastPreviewURL(null);
        }
        break;
      }

      case CastCommand.refreshPlaylist:
      case CastCommand.setShuffle: {
        if (castInfo.playlist?.items?.length) {
          if (currentIndexRef.current < 0 || playlistLengthRef.current === 0) {
            applyQueuedPlaylistIfExists(castInfo.index);
          }
          break;
        }

        clearTimer();
        clearNoteTimeout();
        currentItemRef.current = undefined;
        setPlaylist([]);
        setCurrentIndex(-1);
        setPlaylistDefaultsSettings(null);
        setPlaylistNote(null);
        setActiveNote(null);
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
            break;
          }
        }

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
        break;
      }

      case CastCommand.setLoop: {
        loopModeRef.current =
          castInfo.loopMode && validLoopModes.has(castInfo.loopMode)
            ? castInfo.loopMode
            : LoopMode.playlist;
        break;
      }
    }
  }, [applyQueuedPlaylistIfExists, castInfo, clearTimer, clearNoteTimeout]);

  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        {activeNote ? (
          <NoteCard note={activeNote} />
        ) : (
          currentItemDisplayPreference && (
            <ArtworkPlayer
              previewURL={castPreviewURL ?? ''}
              displayPreferences={currentItemDisplayPreference}
            />
          )
        )}
      </div>
    </>
  );
}
