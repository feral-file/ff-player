import { MutableRefObject, useEffect } from 'react';
import { CastCommand, CastInfo } from '@/models';
import { DP1DisplayPreference, DP1Item } from '@/models/dp1.model';
import {
  calculateStartTime,
  getArtworkStartTime,
  recalculateStartTimeForIndex,
} from '@/utils/playlist';
import { canvasService } from '@/services/CanvasService';

interface UseKeyboardTransportControlsParams {
  castInfo?: CastInfo;
  playlist: DP1Item[];
  currentIndex: number;
  startTime: number;
  displayPreference?: DP1DisplayPreference | null;
  elapsedTimeRef: MutableRefObject<number>;
  remainTimeRef: MutableRefObject<number>;
}

const isKeyboardTransportEnabled = (
  displayPreference?: DP1DisplayPreference | null
): boolean => {
  const keyboardShortcuts = displayPreference?.interaction?.keyboard ?? [];
  const hasExplicitOptIn =
    keyboardShortcuts.includes('transport') ||
    keyboardShortcuts.includes('transportControls') ||
    keyboardShortcuts.includes('nextArtwork') ||
    keyboardShortcuts.includes('previousArtwork') ||
    keyboardShortcuts.includes('togglePause');

  const isLocalTestingHost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  return hasExplicitOptIn || isLocalTestingHost;
};

export const useKeyboardTransportControls = ({
  castInfo,
  playlist,
  currentIndex,
  startTime,
  displayPreference,
  elapsedTimeRef,
  remainTimeRef,
}: UseKeyboardTransportControlsParams) => {
  useEffect(() => {
    if (!isKeyboardTransportEnabled(displayPreference)) {
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName.toLowerCase();
      return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        target.isContentEditable
      );
    };

    const getCurrentItemDurationMs = () => {
      if (currentIndex < 0 || currentIndex >= playlist.length) {
        return 0;
      }

      return (playlist[currentIndex]?.duration ?? 0) * 1000;
    };

    const getCurrentItemElapsedMs = () => {
      if (currentIndex < 0 || currentIndex >= playlist.length) {
        return 0;
      }

      const playlistStartTime =
        startTime > 0 ? startTime : (castInfo?.startTime ?? Date.now());
      const artworkStartTime = getArtworkStartTime(
        playlist,
        currentIndex,
        playlistStartTime
      );
      return Math.max(0, Date.now() - artworkStartTime);
    };

    const handleNextFromKey = () => {
      if (!playlist.length) {
        return;
      }

      const nextIndex =
        currentIndex >= 0 ? (currentIndex + 1) % playlist.length : 0;
      const nextStartTime = recalculateStartTimeForIndex(playlist, nextIndex);
      canvasService.setCastInfo({
        ...(castInfo ?? {}),
        castCommand: CastCommand.nextArtwork,
        index: nextIndex,
        startTime: nextStartTime,
        isPaused: false,
      });
    };

    const handlePreviousFromKey = () => {
      if (!playlist.length) {
        return;
      }

      const prevIndex =
        currentIndex >= 0
          ? (currentIndex - 1 + playlist.length) % playlist.length
          : 0;
      const nextStartTime = recalculateStartTimeForIndex(playlist, prevIndex);
      canvasService.setCastInfo({
        ...(castInfo ?? {}),
        castCommand: CastCommand.previousArtwork,
        index: prevIndex,
        startTime: nextStartTime,
        isPaused: false,
      });
    };

    const handleTogglePause = () => {
      if (!playlist.length || currentIndex < 0) {
        return;
      }

      const durationMs = getCurrentItemDurationMs();
      if (castInfo?.isPaused) {
        const nextStartTime = calculateStartTime(
          playlist,
          currentIndex,
          elapsedTimeRef.current
        );
        canvasService.setCastInfo({
          ...castInfo,
          castCommand: CastCommand.resumeCasting,
          isPaused: false,
          startTime: nextStartTime,
        });
        return;
      }

      const elapsedMs = durationMs
        ? Math.min(durationMs, getCurrentItemElapsedMs())
        : 0;
      const remainMs = durationMs ? Math.max(0, durationMs - elapsedMs) : 0;
      elapsedTimeRef.current = elapsedMs;
      remainTimeRef.current = remainMs;

      canvasService.setCastInfo({
        ...(castInfo ?? {}),
        castCommand: CastCommand.pauseCasting,
        isPaused: true,
        elapsedTime: elapsedMs,
        remainTime: remainMs,
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return;
      }

      if (event.code === 'ArrowRight') {
        event.preventDefault();
        handleNextFromKey();
        return;
      }

      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        handlePreviousFromKey();
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        handleTogglePause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    castInfo,
    currentIndex,
    playlist,
    startTime,
    displayPreference,
    elapsedTimeRef,
    remainTimeRef,
  ]);
};
