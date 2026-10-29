import type { DP1DisplayPreference } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import type { Dispatch, SetStateAction } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ArtworkTransition } from './ArtworkTransition';
import type { ArtworkPlayerProps } from './artworkTypes';

interface Composition {
  showingKey: string;
  settings: DP1DisplayPreference | undefined;
}

/** Latches the selected settings only when the transition commits the visible layer. */
export class CommittedComposition {
  private selected: Composition;
  constructor(
    initial: Composition,
    private readonly publish: Dispatch<SetStateAction<Composition | undefined>>
  ) {
    this.selected = initial;
  }
  updateSelected(selected: Composition) {
    this.selected = selected;
  }
  get showingKey() {
    return this.selected.showingKey;
  }
  commit() {
    this.publish(this.selected);
  }
}

/** Owns composition identity and the reporter's lifetime independently of cast selection. */
export function useCommittedComposition(
  settings: DP1DisplayPreference | undefined,
  showingKey: string
) {
  const [committed, setCommitted] = useState<Composition>();
  const owner = useRef({});
  const [composition] = useState(
    () => new CommittedComposition({ settings, showingKey }, setCommitted)
  );
  useLayoutEffect(() => {
    composition.updateSelected({ settings, showingKey });
  }, [composition, settings, showingKey]);
  useLayoutEffect(() => {
    if (!committed) {
      return;
    }
    return canvasService.registerDisplaySettingsReporter(
      () => ({
        ...committed,
        acceptsUpdates: composition.showingKey === committed.showingKey,
      }),
      owner.current
    );
  }, [composition, committed]);
  return {
    composition,
    committed,
    committedVisualSettings: committed ? committed.settings : settings,
  };
}

/** Same-showing adjustments settle in layout before a later settings command can be accepted. */
export function useLiveComposition(input: {
  composition: CommittedComposition;
  committed: Composition | undefined;
  transition: ArtworkTransition;
  props: ArtworkPlayerProps;
  settings: DP1DisplayPreference | undefined;
  showingKey: string;
}) {
  const { composition, committed, transition, props, settings, showingKey } =
    input;
  useLayoutEffect(() => {
    if (
      committed &&
      !transition.transitionPending(
        props.previewURL,
        props.itemIdentity ?? '',
        showingKey
      )
    ) {
      composition.commit();
    }
  }, [
    composition,
    committed,
    transition,
    props.previewURL,
    props.itemIdentity,
    settings,
    showingKey,
  ]);
}
