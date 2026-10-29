import type { CastInfo } from '@/models';
import type { DisplaySettings } from '@/models/display_settings.model';
import type { DP1Defaults, DP1Item } from '@/models/dp1.model';
import type { ContentContext } from '@/services/contentPolicy';
import type { useContentPolicy } from '@/services/custom-hooks/useContentPolicy';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { PlaylistTimeline, type TimelineUI } from './PlaylistTimeline';
import type { useArtworkRefreshBridge } from './useArtworkRefreshBridge';
import { useMergeLandedRearm } from './useMergeLandedRearm';
import { usePlaylistItemDisplayPreference } from './usePlaylistItemDisplayPreference';
import {
  usePlaylistCastCommands,
  usePlaylistSlotEntry,
} from './usePlaylistTimelineEffects';
interface TimelineOptions {
  playlist: DP1Item[];
  currentIndex: number;
  playlistDefaultsSettings: DP1Defaults | null;
  ui: TimelineUI;
  bridge: ReturnType<typeof useArtworkRefreshBridge>;
  deviceDisplaySettings: DisplaySettings | null;
  castInfo: CastInfo | null;
  contentContext: ContentContext;
  contentPolicy: ReturnType<typeof useContentPolicy>;
}
/** Bind view snapshots and effects in slot-entry, merge, then command order. */
export function usePlaylistTimeline(options: TimelineOptions) {
  const {
    playlist,
    currentIndex,
    playlistDefaultsSettings,
    ui,
    bridge,
    deviceDisplaySettings,
    castInfo,
    contentContext,
    contentPolicy,
  } = options;
  const [timeline] = useState(() => new PlaylistTimeline(ui));
  timeline.observeView(playlist, currentIndex, playlistDefaultsSettings);
  const preferences = usePlaylistItemDisplayPreference({
    playlistDefaults: playlistDefaultsSettings,
    deviceDisplaySettings,
    readSlot: timeline.readSlot,
  });
  const currentItemDisplayPreference = preferences.preference;
  timeline.bind({
    ...preferences,
    resetPreference: preferences.reset,
    clearPreview: bridge.clearPreview,
    triggerArtworkRefresh: bridge.triggerArtworkRefresh,
    reload: () => {
      bridge.artworkPerformReloadRef.current?.();
    },
  });
  useEffect(() => timeline.clearTimer, [timeline]);
  useLayoutEffect(() => {
    timeline.commitSelection(currentIndex, playlist);
  }, [timeline, currentIndex, playlist]);
  const scheduleCurrentItemTimer = useCallback(
    (index: number, items: DP1Item[], preserveElapsed = false) => {
      timeline.schedule(
        index,
        items,
        preserveElapsed,
        playlistDefaultsSettings
      );
    },
    [timeline, playlistDefaultsSettings]
  );
  usePlaylistSlotEntry({
    timeline,
    currentIndex,
    playlist,
    playlistDefaultsSettings,
    clearPreview: bridge.clearPreview,
    publishPreview: bridge.publishPreview,
    retireCommittedIfGone: bridge.retireCommittedIfGone,
    handleItemDisplayPreference: preferences.resolveForSlot,
    scheduleCurrentItemTimer,
    contentContext,
    contentPolicy,
  });
  useMergeLandedRearm({
    preference: currentItemDisplayPreference,
    readSlot: timeline.readSlot,
    scheduleCurrentItemTimer,
  });
  usePlaylistCastCommands(
    timeline,
    castInfo,
    preferences,
    scheduleCurrentItemTimer
  );
  return { timeline, currentItemDisplayPreference };
}
