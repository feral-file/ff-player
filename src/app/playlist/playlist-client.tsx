'use client';
import ArtworkPlayer from '@/components/artwork-player/ArtworkPlayer';
import TombstoneOverlay from '@/components/tombstone/TombstoneOverlay';
import { usePlaylistPlayback } from './usePlaylistPlayback';
/** Presents the route snapshot; playback timing and command state live in their owners. */
export default function PlaylistClient() {
  const {
    currentItemDisplayPreference,
    permitted,
    contentPolicy,
    castPreviewURL,
    currentItemIdentity,
    currentShowingKey,
    registerArtworkReload,
    handleSourceEnded,
    handleArtworkExhausted,
    notePreviewCommitted,
    handleArtworkCommitted,
    tombstoneMode,
    tombstoneItemKey,
    tombstoneTitle,
    tombstoneArtist,
    curatorName,
  } = usePlaylistPlayback();
  return (
    <>
      <div style={{ width: '100%', height: '100%' }}>
        {currentItemDisplayPreference && permitted && (
          <ArtworkPlayer
            key={contentPolicy.retireEpoch}
            previewURL={castPreviewURL ?? ''}
            displayPreferences={currentItemDisplayPreference}
            itemIdentity={currentItemIdentity}
            sessionKey={currentShowingKey}
            onRegisterArtworkReload={registerArtworkReload}
            onSourceEnded={handleSourceEnded}
            onArtworkExhausted={handleArtworkExhausted}
            onItemCommitted={notePreviewCommitted}
            onItemPlayed={handleArtworkCommitted}
          />
        )}
        {permitted && (
          <TombstoneOverlay
            mode={tombstoneMode}
            itemKey={tombstoneItemKey}
            title={tombstoneTitle}
            artistName={tombstoneArtist}
            curatorName={curatorName}
          />
        )}
      </div>
    </>
  );
}
