import { useAppContext } from '@/context/AppContext';
import { useArtworkSettings } from '@/services/custom-hooks/useArtworkSettings';
import { useMemo, useState } from 'react';
import { ArtworkLoadEvents } from './ArtworkLoadEvents';
import { ArtworkPlayerProps } from './artworkTypes';
import { SlotMediaResources } from './SlotMediaResources';
import { useArtworkRecovery, usePlaybackDegraded } from './useArtworkRecovery';
import { useArtworkSoftwareURLs, useArtworkSource } from './useArtworkSource';
import { useArtworkTransition } from './useArtworkTransition';
import {
  useCommittedComposition,
  useLiveComposition,
} from './useCommittedComposition';
import { useMediaEvents, useSlotMedia, useVisibleMedia } from './useSlotMedia';
import { useWebGLRecovery } from './useWebGLRecovery';
import { useWorkOriginFrame } from './useWorkOriginFrame';

const ignoreStreamOutcome = () => undefined;

/** Composes the playback owners; their state and browser resources stay private to each owner. */
export function useArtworkPlayback(props: ArtworkPlayerProps) {
  const { context } = useAppContext();
  const showingKey = props.sessionKey ?? props.itemIdentity ?? props.previewURL;
  const { displaySettings } = useArtworkSettings(
    props.displayPreferences,
    showingKey,
    context.displaySettings?.framing
  );
  const loading = useArtworkRecovery(props);
  const note = usePlaybackDegraded(
    props,
    loading.recovery,
    context.setPlaybackDegraded
  );
  const composition = useCommittedComposition(displaySettings, showingKey);
  const [resources] = useState(() => new SlotMediaResources());
  const view = useArtworkTransition(props, {
    recovery: loading.recovery,
    media: resources,
    composition: composition.composition,
  });
  const { transition } = view;
  useLiveComposition({
    ...composition,
    transition,
    props,
    settings: displaySettings,
    showingKey,
  });
  const webGL = useWebGLRecovery(
    props.previewURL,
    loading.recovery,
    transition
  );
  const events = useMemo(
    () => new ArtworkLoadEvents(transition, loading.recovery, webGL, note),
    [transition, loading.recovery, webGL, note]
  );
  const mediaEvents = useMediaEvents(transition, loading.recovery, note);
  const streamEvents = useMediaEvents(
    transition,
    loading.recovery,
    ignoreStreamOutcome
  );
  const mediaSetup = {
    resources,
    events: mediaEvents,
    streamEvents,
    onArtworkExhausted: props.onArtworkExhausted,
  };
  useArtworkSource(props, showingKey, loading.artworkReloadTick, {
    transition,
    recovery: loading.recovery,
    note,
  });
  useSlotMedia(0, view.slots[0], mediaSetup);
  useSlotMedia(1, view.slots[1], mediaSetup);
  useVisibleMedia(view, resources, transition, context.isOnline);
  useArtworkSoftwareURLs({
    slots: view.slots,
    transition,
    settings: displaySettings,
    committedSettings: composition.committedVisualSettings,
    viewMode: context.deviceRotation?.viewMode,
  });
  useWorkOriginFrame(resources, transition, events);
  const showRenderLoadingOverlay =
    context.appRemoteConfig.showRenderLoadingOverlay ?? true;
  return {
    context,
    displaySettings,
    composition,
    loading,
    resources,
    view,
    transition,
    events,
    showRenderLoadingOverlay,
  };
}
