import type { CastInfo } from '@/models';
import { DP1Defaults, DP1Item } from '@/models/dp1.model';
import type { ContentContext } from '@/services/contentPolicy';
import { allowsContent } from '@/services/contentPolicy';
import { policyInForce } from '@/services/ContentPolicyStore';
import { useContentPolicy } from '@/services/custom-hooks/useContentPolicy';
import { normalizePlaylistIndex } from '@/utils/playlist';
import { useEffect } from 'react';
import { PlaylistTimeline } from './PlaylistTimeline';
import { usePlaylistItemDisplayPreference } from './usePlaylistItemDisplayPreference';
/** Slot entry publishes preview and resolves display policy before arming its timer. */
export function usePlaylistSlotEntry(options: {
  currentIndex: number;
  playlist: DP1Item[];
  playlistDefaultsSettings: DP1Defaults | null;
  clearPreview: () => void;
  publishPreview: (item: DP1Item) => void;
  retireCommittedIfGone: (check: (item: DP1Item) => boolean) => void;
  handleItemDisplayPreference: (item: DP1Item, index: number) => Promise<void>;
  scheduleCurrentItemTimer: (
    index: number,
    items: DP1Item[],
    preserveElapsed?: boolean
  ) => void;
  contentContext: ContentContext;
  contentPolicy: ReturnType<typeof useContentPolicy>;
  timeline: PlaylistTimeline;
}) {
  const {
    currentIndex,
    playlist,
    playlistDefaultsSettings,
    clearPreview,
    publishPreview,
    retireCommittedIfGone,
    handleItemDisplayPreference,
    scheduleCurrentItemTimer,
    contentContext,
    contentPolicy,
    timeline,
  } = options;
  const clearTimer = timeline.clearTimer;
  useEffect(() => {
    if (currentIndex < 0 || playlist.length === 0) {
      timeline.clearEmptySlot();
      return;
    }

    const normalizedIndex = normalizePlaylistIndex(
      currentIndex,
      playlist.length
    );
    const currentItem = playlist[normalizedIndex];

    // The final media gate is not enough: do not fetch a blocked work's ref
    // manifest while its slot is hidden or while policy hydration is pending.
    const inForce = policyInForce(contentPolicy);
    if (!inForce || !allowsContent(currentItem, inForce, contentContext)) {
      clearTimer();
      clearPreview();
      return;
    }
    // A policy change can retire the work on screen while this selected one
    // stays allowed; the gate would otherwise keep judging the retired work
    // and never let its replacement mount.
    retireCommittedIfGone(onScreen =>
      allowsContent(onScreen, inForce, contentContext)
    );
    void handleItemDisplayPreference(currentItem, normalizedIndex);
    publishPreview(currentItem);
    scheduleCurrentItemTimer(normalizedIndex, playlist);

    return () => {
      clearTimer();
    };
  }, [
    currentIndex,
    playlist,
    playlistDefaultsSettings,
    clearTimer,
    clearPreview,
    publishPreview,
    retireCommittedIfGone,
    handleItemDisplayPreference,
    scheduleCurrentItemTimer,
    contentContext,
    contentPolicy,
    timeline,
  ]);
}
/** Cast commands remain passive effects, after slot entry and merge-landed rearming. */
export function usePlaylistCastCommands(
  timeline: PlaylistTimeline,
  castInfo: CastInfo | null,
  preferences: ReturnType<typeof usePlaylistItemDisplayPreference>,
  scheduleCurrentItemTimer: (
    index: number,
    items: DP1Item[],
    preserveElapsed?: boolean
  ) => void
) {
  const { clearMergedDisplayForNewCast, clearMergedDisplay, reset } =
    preferences;
  useEffect(() => {
    timeline.acceptCast(castInfo);
  }, [
    timeline,
    castInfo,
    clearMergedDisplayForNewCast,
    clearMergedDisplay,
    reset,
    scheduleCurrentItemTimer,
  ]);
}
