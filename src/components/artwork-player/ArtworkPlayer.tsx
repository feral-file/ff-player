import { ArtworkSlot } from './ArtworkSlot';
import { ArtworkStage, showsGlobalLoading } from './ArtworkStage';
import { ArtworkPlayerProps, SLOT_INDICES } from './artworkTypes';
import { useArtworkPlayback } from './useArtworkPlayback';

/** Renders the composed playback snapshot using the established route props and two-slot DOM. */
export default function ArtworkPlayer(props: ArtworkPlayerProps) {
  const {
    context,
    displaySettings,
    composition,
    loading,
    resources,
    view,
    transition,
    events,
    showRenderLoadingOverlay,
  } = useArtworkPlayback(props);
  return (
    <ArtworkStage
      settings={composition.committedVisualSettings}
      loading={loading}
      showLoading={showsGlobalLoading(
        view,
        loading,
        props.previewURL,
        showRenderLoadingOverlay
      )}
      cursorPositions={context.cursorPositions}>
      {SLOT_INDICES.map(index => {
        const slot = view.slots[index];
        return (
          slot && (
            <ArtworkSlot
              key={`${slot.previewURL}-${String(slot.iframeKey)}`}
              index={index}
              slot={slot}
              opacity={view.slotOpacity[index]}
              top={view.topSlotIndex === index}
              resources={resources}
              transition={transition}
              events={events}
              settings={displaySettings}
              committedSettings={composition.committedVisualSettings}
              isCustomView={props.isCustomView}
              showModelLoading={showRenderLoadingOverlay && loading.showLoading}
              onSourceEnded={props.onSourceEnded}
            />
          )
        );
      })}
    </ArtworkStage>
  );
}
