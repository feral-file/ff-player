import { PreviewHTMLTag } from '@/models';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ArtworkRecovery } from './ArtworkRecovery';
import type { ArtworkTransition, TransitionView } from './ArtworkTransition';
import type { SlotIndex, SlotLayer } from './artworkTypes';
import { MediaEvents, SlotMediaResources } from './SlotMediaResources';

/** Adapts resource events to owner operations; no resource callback mutates transition state. */
export function useMediaEvents(
  transition: ArtworkTransition,
  recovery: ArtworkRecovery,
  note: MediaEvents['note']
): MediaEvents {
  return useMemo(
    () => ({
      isCurrent: (index, layer) =>
        transition.isCurrentArtworkSlot(index, layer),
      loaded: (index, layer, success) =>
        transition.loadedSource(index, layer, success),
      failed: (index, layer) => {
        transition.fail(index, layer);
      },
      note,
      targetSlot: () => transition.targetSlot,
      incomingSlot: () => transition.incomingSlot,
      status: () => recovery.status,
      matchesTarget: (url, identity) => transition.matchesTarget(url, identity),
    }),
    [transition, recovery, note]
  );
}

/** Preserves the distinct HLS and ordinary-media setup keys, including the iframe-only reload exception. */
export function useSlotMedia(
  index: SlotIndex,
  layer: SlotLayer | null,
  setup: {
    resources: SlotMediaResources;
    events: MediaEvents;
    streamEvents: MediaEvents;
    onArtworkExhausted?: (identity: string) => void;
  }
) {
  const { resources, events, streamEvents, onArtworkExhausted } = setup;
  const committedLayer = useRef(layer);
  useLayoutEffect(() => {
    committedLayer.current = layer;
  }, [layer]);
  const mediaKey = JSON.stringify([
    layer?.displayPreviewURL,
    layer?.previewType,
    layer?.isStreaming,
    layer?.itemIdentity,
    layer?.showingKey,
  ]);
  const streamKey = JSON.stringify([
    layer?.displayPreviewURL,
    layer?.previewType,
    layer?.isStreaming,
  ]);
  useEffect(
    () =>
      resources.setupStreamingVideoForSlot(
        index,
        committedLayer.current,
        streamEvents
      ),
    [index, resources, streamEvents, streamKey, onArtworkExhausted]
  );
  useEffect(
    () => resources.setupMediaForSlot(index, committedLayer.current, events),
    [index, resources, events, mediaKey, onArtworkExhausted]
  );
}

/** Only visible target video plays; loss of WAN pauses streaming, never buffered/local video. */
export function useVisibleMedia(
  view: TransitionView,
  resources: SlotMediaResources,
  transition: ArtworkTransition,
  online: boolean
) {
  const { slots, slotOpacity, topSlotIndex, activeSlot } = view;
  useEffect(() => {
    const target = topSlotIndex ?? transition.activeSlot;
    for (const index of [0, 1] as const) {
      const layer = slots[index];
      const video = resources.video(index);
      const play =
        layer?.previewType === PreviewHTMLTag.video &&
        video &&
        slotOpacity[index] > 0.05 &&
        index === target &&
        !(layer.isStreaming && !online);
      if (play) {
        if (video.paused) {
          const promise = video.play() as Promise<void> | undefined;
          void promise?.catch((error: unknown) => {
            console.log(
              '[ArtworkPlayer] Error play video',
              JSON.stringify(error)
            );
          });
        }
      } else {
        video?.pause();
      }
    }
  }, [online, slots, slotOpacity, topSlotIndex, resources, transition]);
  useEffect(() => {
    const unmute = () => {
      const index = transition.activeSlot;
      const video = resources.video(index);
      if (
        transition.slot(index)?.previewType === PreviewHTMLTag.video &&
        video
      ) {
        video.muted = false;
        document.removeEventListener('click', unmute);
      }
    };
    if (
      slots[activeSlot]?.previewType === PreviewHTMLTag.video &&
      resources.video(activeSlot)
    ) {
      document.addEventListener('click', unmute);
    }
    return () => {
      document.removeEventListener('click', unmute);
    };
  }, [slots, activeSlot, resources, transition]);
}
