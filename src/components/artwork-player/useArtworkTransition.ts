import { useEffect, useLayoutEffect, useState } from 'react';
import type { ArtworkRecovery } from './ArtworkRecovery';
import { ArtworkTransition, Opacity, Slots } from './ArtworkTransition';
import type { ArtworkPlayerProps, SlotIndex } from './artworkTypes';
import type { SlotMediaResources } from './SlotMediaResources';
import type { CommittedComposition } from './useCommittedComposition';
/** Publishes React slot snapshots to the transition owner in the layout phase, before media events can observe them. */
export function useArtworkTransition(
  props: ArtworkPlayerProps,
  owners: {
    recovery: ArtworkRecovery;
    media: SlotMediaResources;
    composition: CommittedComposition;
  }
) {
  const [slots, setSlots] = useState<Slots>([null, null]);
  const [slotOpacity, setSlotOpacity] = useState<Opacity>([1, 0]);
  const [activeSlot, setActiveSlot] = useState<SlotIndex>(0);
  const [topSlotIndex, setTopSlotIndex] = useState<SlotIndex | null>(null);
  const [transition] = useState(
    () =>
      new ArtworkTransition(
        { setSlots, setSlotOpacity, setActiveSlot, setTopSlotIndex },
        owners.recovery,
        owners.media,
        owners.composition
      )
  );
  transition.updatePlayedCallback(props.onItemPlayed);
  useLayoutEffect(() => {
    transition.updateTarget(props.previewURL, props.itemIdentity ?? '');
  }, [transition, props.previewURL, props.itemIdentity]);
  useLayoutEffect(() => {
    transition.syncView({ slots, slotOpacity, activeSlot, topSlotIndex });
  }, [transition, slots, slotOpacity, activeSlot, topSlotIndex]);
  useLayoutEffect(() => {
    transition.commitReadySlot(slots, {
      onItemCommitted: props.onItemCommitted,
      onItemPlayed: props.onItemPlayed,
    });
  }, [transition, slots, props.onItemCommitted, props.onItemPlayed]);
  useEffect(
    () => () => {
      transition.dispose();
    },
    [transition]
  );
  return { transition, slots, slotOpacity, activeSlot, topSlotIndex };
}
