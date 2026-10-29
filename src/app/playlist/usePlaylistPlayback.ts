import { useAppContext } from '@/context/AppContext';
import { DP1Defaults, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { parseContentContext } from '@/services/contentPolicy';
import { permitsCurrentPreview } from '@/services/contentRendering';
import { useContentPolicy } from '@/services/custom-hooks/useContentPolicy';
import { useRef, useState } from 'react';
import { useArtworkRefreshBridge } from './useArtworkRefreshBridge';
import {
  useCurrentItemIdentity,
  useShowingKey,
} from './useCurrentItemIdentity';
import { usePlaylistTimeline } from './usePlaylistTimeline';
import { useRecentlyPlayedCommit } from './useRecentlyPlayedCommit';
import { useTombstone } from './useTombstone';
/** Composes route owners and keeps timer mutations behind the timeline's operations. */
export function usePlaylistPlayback() {
  const castInfo = useAppContext().context.castInfo;
  const deviceDisplaySettings = useAppContext().context.displaySettings;
  const contentPolicy = useContentPolicy();
  const contentContext = parseContentContext(castInfo?.contentContext);
  const [playlist, setPlaylist] = useState<DP1Item[]>([]);
  const [playlistDefaultsSettings, setPlaylistDefaultsSettings] =
    useState<DP1Defaults | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [castPreviewURL, setCastPreviewURL] = useState<string | null>(null);
  const bridge = useArtworkRefreshBridge(setCastPreviewURL, identity => {
    handleItemCommittedRef.current(identity);
  });
  const { registerArtworkReload, getShowing, notePreviewCommitted } = bridge;
  const handleItemCommittedRef = useRef<(identity: string) => void>(
    () => undefined
  );
  const { timeline, currentItemDisplayPreference } = usePlaylistTimeline({
    playlist,
    currentIndex,
    playlistDefaultsSettings,
    ui: {
      setPlaylist,
      setIndex: setCurrentIndex,
      setDefaults: setPlaylistDefaultsSettings,
    },
    bridge,
    deviceDisplaySettings,
    castInfo,
    contentContext,
    contentPolicy,
  });
  const currentItemIdentity = useCurrentItemIdentity(playlist, currentIndex);
  const currentShowingKey = useShowingKey(playlist, currentIndex);
  const permitted =
    castInfo !== null &&
    permitsCurrentPreview(
      canvasService.getCastInfo(),
      getShowing(),
      castPreviewURL,
      contentPolicy
    );
  const {
    handleItemCommitted,
    mode: tombstoneMode,
    itemKey: tombstoneItemKey,
    title: tombstoneTitle,
    artistName: tombstoneArtist,
  } = useTombstone(playlist, deviceDisplaySettings);
  handleItemCommittedRef.current = handleItemCommitted;
  const handleArtworkCommitted = useRecentlyPlayedCommit(
    playlist,
    playlistDefaultsSettings,
    contentContext
  );
  return {
    currentItemDisplayPreference,
    permitted,
    contentPolicy,
    castPreviewURL,
    currentItemIdentity,
    currentShowingKey,
    registerArtworkReload,
    handleSourceEnded: timeline.sourceEnded,
    handleArtworkExhausted: timeline.artworkExhausted,
    notePreviewCommitted,
    handleArtworkCommitted,
    tombstoneMode,
    tombstoneItemKey,
    tombstoneTitle,
    tombstoneArtist,
    curatorName: castInfo?.playlist?.curator,
  };
}
