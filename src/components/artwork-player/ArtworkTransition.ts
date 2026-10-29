import { RenderStatus } from '@/models';
import type { Dispatch, SetStateAction } from 'react';
import type { ArtworkRecovery } from './ArtworkRecovery';
import {
  ArtworkPlayerProps,
  FADE_IN_OUT_DURATION_MS,
  SlotIndex,
  SlotLayer,
  createSlotLayer,
  isEmbeddedHeavy,
} from './artworkTypes';
import type { SlotMediaResources } from './SlotMediaResources';
import type { CommittedComposition } from './useCommittedComposition';
type Setter<T> = Dispatch<SetStateAction<T>>;
export type Slots = [SlotLayer | null, SlotLayer | null];
export type Opacity = [number, number];
export interface TransitionView {
  slots: Slots;
  slotOpacity: Opacity;
  activeSlot: SlotIndex;
  topSlotIndex: SlotIndex | null;
}
export interface TransitionUI {
  setSlots: Setter<Slots>;
  setSlotOpacity: Setter<Opacity>;
  setActiveSlot: Setter<SlotIndex>;
  setTopSlotIndex: Setter<SlotIndex | null>;
}
interface CommitCallbacks {
  onItemCommitted?: (identity: string) => void;
  onItemPlayed?: ArtworkPlayerProps['onItemPlayed'];
}
/** Owns slot identity and transition acceptance. Resource callbacks never write slot refs directly. */
export class ArtworkTransition {
  private previewURLRef = { current: '' };
  private itemIdentityRef = { current: '' };
  private slotsRef: { current: Slots } = { current: [null, null] };
  private activeSlotRef: { current: SlotIndex } = { current: 0 };
  private slotOpacityRef: { current: Opacity } = { current: [1, 0] };
  private incomingSlotRef: { current: SlotIndex | null } = { current: null };
  private pendingReadySlotRef: { current: SlotIndex | null } = {
    current: null,
  };
  private committedAsFailureRef = { current: [false, false] };
  private itemPlayedFiredRef = { current: [false, false] };
  private occurrenceRecovery: ((() => void) | undefined)[] = [];
  private transitionTokenRef = { current: 0 };
  private transitionTimeoutRef: { current: NodeJS.Timeout | undefined } = {
    current: undefined,
  };
  private iframeKeyCounterRef = { current: 0 };
  private onItemPlayedRef: { current: CommitCallbacks['onItemPlayed'] } = {
    current: undefined,
  };
  constructor(
    private readonly ui: TransitionUI,
    private readonly recovery: ArtworkRecovery,
    private readonly media: SlotMediaResources,
    private readonly composition: CommittedComposition
  ) {}
  updateTarget(url: string, identity: string) {
    this.previewURLRef.current = url;
    this.itemIdentityRef.current = identity;
  }
  syncView(view: TransitionView) {
    this.slotsRef.current = view.slots;
    this.activeSlotRef.current = view.activeSlot;
    this.slotOpacityRef.current = view.slotOpacity;
  }
  /** The delayed history callback uses the latest cast context, matching the renderer's existing callback ref. */
  updatePlayedCallback(callback: CommitCallbacks['onItemPlayed']) {
    this.onItemPlayedRef.current = callback;
  }
  slot(index: SlotIndex) {
    return this.slotsRef.current[index];
  }
  get activeSlot() {
    return this.activeSlotRef.current;
  }
  get incomingSlot() {
    return this.incomingSlotRef.current;
  }
  get targetSlot() {
    return this.incomingSlot ?? this.activeSlot;
  }
  matchesTarget(url: string, identity: string) {
    return (
      this.previewURLRef.current === url &&
      this.itemIdentityRef.current === identity
    );
  }
  isCurrentArtworkSlot(slotIndex: SlotIndex, expectedLayer?: SlotLayer) {
    const currentURL = this.previewURLRef.current;
    const slot = this.slotsRef.current[slotIndex];
    if (!slot) {
      return false;
    }
    if (
      expectedLayer &&
      (slot.previewURL !== expectedLayer.previewURL ||
        slot.itemIdentity !== expectedLayer.itemIdentity ||
        slot.showingKey !== expectedLayer.showingKey ||
        slot.iframeKey !== expectedLayer.iframeKey)
    ) {
      return false;
    }
    if (slot.previewURL !== currentURL) {
      return false;
    }
    if (slot.itemIdentity !== this.itemIdentityRef.current) {
      return false;
    }
    if (slot.showingKey !== this.composition.showingKey) {
      return false;
    }
    const currentIncoming = this.incomingSlotRef.current;
    if (currentIncoming !== null && currentIncoming !== slotIndex) {
      const incomingLayer = this.slotsRef.current[currentIncoming];
      if (
        incomingLayer?.previewURL === currentURL &&
        incomingLayer.showingKey === this.composition.showingKey &&
        incomingLayer.itemIdentity === this.itemIdentityRef.current
      ) {
        return false;
      }
    }
    return true;
  }
  updateSlot(slotIndex: SlotIndex, patch: Partial<SlotLayer>) {
    this.ui.setSlots(prev => {
      const cur = prev[slotIndex];
      if (!cur) {
        return prev;
      }
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[slotIndex] = { ...cur, ...patch };
      return next;
    });
  }
  private markSlotReady(slotIndex: SlotIndex) {
    const currentURL = this.previewURLRef.current;
    this.ui.setSlots(prev => {
      const layer = prev[slotIndex];
      if (layer?.previewURL !== currentURL || !layer.loading) {
        return prev;
      }
      this.pendingReadySlotRef.current = slotIndex;
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[slotIndex] = { ...layer, loading: false };
      return next;
    });
  }
  loadedSource(
    slotIndex: SlotIndex,
    expectedLayer?: SlotLayer,
    isSuccess = true
  ): boolean {
    if (!this.isCurrentArtworkSlot(slotIndex, expectedLayer)) {
      return false;
    }
    const currentIncoming = this.incomingSlotRef.current;
    if (currentIncoming !== null && currentIncoming !== slotIndex) {
      const incomingLayer = this.slotsRef.current[currentIncoming];
      if (incomingLayer?.previewURL === this.previewURLRef.current) {
        return false;
      }
    }
    this.incomingSlotRef.current = slotIndex;
    this.committedAsFailureRef.current[slotIndex] = !isSuccess;
    const wasFailed = this.recovery.status === RenderStatus.failed;
    this.markSlotReady(slotIndex);
    if (isSuccess) {
      this.recovery.acceptSuccess();
      // Only an accepted load can restore a suspended occurrence. A delayed
      // fade callback can run after another failure and is not new evidence.
      this.occurrenceRecovery[slotIndex]?.();
      if (wasFailed) {
        this.recovery.markArtworkReady(
          this.committedAsFailureRef.current[slotIndex]
        );
        this.incomingSlotRef.current = null;
        this.notifyPlayed(
          slotIndex,
          expectedLayer?.itemIdentity ?? this.itemIdentityRef.current,
          this.onItemPlayedRef.current
        );
      }
    }
    return true;
  }
  /** Failures still commit their layer, releasing the settings latch, but cannot count as played. */
  fail(slotIndex?: SlotIndex, expectedLayer?: SlotLayer) {
    if (
      slotIndex !== undefined &&
      !this.isCurrentArtworkSlot(slotIndex, expectedLayer)
    ) {
      return;
    }
    if (slotIndex !== undefined) {
      this.loadedSource(slotIndex, expectedLayer, false);
      this.updateSlot(slotIndex, { loading: false });
      this.media.abort(slotIndex);
    }
    this.recovery.fail();
  }
  prepareMount() {
    this.transitionTokenRef.current++;
    clearTimeout(this.transitionTimeoutRef.current);
    this.transitionTimeoutRef.current = undefined;
    this.ui.setTopSlotIndex(null);
    const current = this.activeSlot;
    const stale: SlotIndex = current === 0 ? 1 : 0;
    this.media.pauseAndTeardownSlot(stale);
    this.ui.setSlotOpacity(current === 0 ? [1, 0] : [0, 1]);
    this.ui.setSlots(prev => {
      if (!prev[stale]) {
        return prev;
      }
      const next: Slots = [...prev];
      next[stale] = null;
      return next;
    });
  }
  mountIncoming(url: string, showingKey: string) {
    const current = this.activeSlot;
    const hasAny = this.slot(current) !== null;
    const target: SlotIndex = hasAny ? (current === 0 ? 1 : 0) : current;
    this.incomingSlotRef.current = target;
    this.media.resetMount(target);
    this.itemPlayedFiredRef.current[target] = false;
    this.occurrenceRecovery[target] = undefined;
    this.ui.setSlots(prev => {
      const next: Slots = hasAny ? [...prev] : [null, null];
      next[target] = createSlotLayer(url, ++this.iframeKeyCounterRef.current, {
        itemIdentity: this.itemIdentityRef.current,
        showingKey,
      });
      return next;
    });
  }
  resolveSource(url: string, patch: Partial<SlotLayer>) {
    const incoming = this.incomingSlot;
    this.ui.setSlots(prev => {
      if (incoming === null || prev[incoming]?.previewURL !== url) {
        return prev;
      }
      const next: Slots = [...prev];
      next[incoming] = { ...prev[incoming], ...patch };
      return next;
    });
  }
  /** First load commits immediately; crossfade callbacks precede fade-end readiness. */
  commitReadySlot(slots: Slots, callbacks: CommitCallbacks) {
    const ready = this.pendingReadySlotRef.current;
    if (ready === null) {
      return;
    }
    const layer = slots[ready];
    if (layer?.previewURL !== this.previewURLRef.current) {
      this.pendingReadySlotRef.current = null;
      return;
    }
    if (layer.loading) {
      return;
    }
    this.pendingReadySlotRef.current = null;
    this.recovery.clearLoadingDelay();
    this.media.frame(ready)?.focus();
    const other: SlotIndex = ready === 0 ? 1 : 0;
    if (!slots[other]) {
      this.commitFirst(ready, layer, callbacks);
      return;
    }
    if (this.incomingSlot !== ready || this.activeSlot === ready) {
      return;
    }
    const outgoing = this.activeSlot;
    const sequential =
      isEmbeddedHeavy(slots[outgoing]?.previewType ?? null) ||
      isEmbeddedHeavy(layer.previewType);
    const token = ++this.transitionTokenRef.current;
    clearTimeout(this.transitionTimeoutRef.current);
    this.media.pauseSlotPlayback(outgoing);
    this.ui.setTopSlotIndex(ready);
    this.ui.setSlotOpacity(prev => {
      const next: Opacity = [...prev];
      next[outgoing] = 0;
      next[ready] = sequential ? 0 : 1;
      return next;
    });
    if (!sequential) {
      this.notifyCommit(ready, layer, callbacks);
    }
    this.transitionTimeoutRef.current = setTimeout(() => {
      if (
        token !== this.transitionTokenRef.current ||
        !this.matchesTarget(layer.previewURL, layer.itemIdentity) ||
        layer.showingKey !== this.composition.showingKey
      ) {
        return;
      }
      this.finishFade(
        { outgoing, incoming: ready, layer, sequential },
        callbacks
      );
    }, FADE_IN_OUT_DURATION_MS);
  }
  private commitFirst(
    index: SlotIndex,
    layer: SlotLayer,
    callbacks: CommitCallbacks
  ) {
    this.composition.commit();
    this.ui.setSlotOpacity(index === 0 ? [1, 0] : [0, 1]);
    this.ui.setActiveSlot(index);
    this.incomingSlotRef.current = null;
    this.ui.setTopSlotIndex(null);
    this.recovery.markArtworkReady(this.committedAsFailureRef.current[index]);
    this.notifyCommit(index, layer, callbacks);
  }
  private notifyCommit(
    index: SlotIndex,
    layer: SlotLayer,
    callbacks: CommitCallbacks
  ) {
    callbacks.onItemCommitted?.(layer.itemIdentity);
    if (this.recovery.status !== RenderStatus.failed) {
      this.notifyPlayed(index, layer.itemIdentity, callbacks.onItemPlayed);
    }
  }
  /** Capture one receipt per showing; a repeated deferred commit is a no-op. */
  private notifyPlayed(
    index: SlotIndex,
    identity: string,
    callback: CommitCallbacks['onItemPlayed']
  ) {
    if (this.itemPlayedFiredRef.current[index]) {
      return;
    }
    this.itemPlayedFiredRef.current[index] = true;
    const receipt = callback?.(identity);
    this.occurrenceRecovery[index] =
      typeof receipt === 'function' ? receipt : undefined;
  }
  private finishFade(
    fade: {
      outgoing: SlotIndex;
      incoming: SlotIndex;
      layer: SlotLayer;
      sequential: boolean;
    },
    callbacks: CommitCallbacks
  ) {
    const { outgoing, incoming, layer, sequential } = fade;
    this.ui.setSlots(prev => {
      const next: Slots = [...prev];
      next[outgoing] = null;
      return next;
    });
    this.composition.commit();
    if (sequential) {
      this.ui.setSlotOpacity(incoming === 0 ? [1, 0] : [0, 1]);
    }
    this.ui.setActiveSlot(incoming);
    this.incomingSlotRef.current = null;
    this.ui.setTopSlotIndex(null);
    this.recovery.markArtworkReady(
      this.committedAsFailureRef.current[incoming]
    );
    if (sequential) {
      this.notifyCommit(incoming, layer, {
        onItemCommitted: callbacks.onItemCommitted,
        onItemPlayed: this.onItemPlayedRef.current,
      });
    }
  }
  reloadIframe(slotIndex: SlotIndex) {
    // Share the mount counter with ordinary retries: a local slot increment
    // could collide with the incoming slot's next key after this reload fails.
    const iframeKey = ++this.iframeKeyCounterRef.current;
    this.ui.setSlots(prev => {
      const slot = prev[slotIndex];
      if (!slot) {
        return prev;
      }
      const next = [...prev] as [SlotLayer | null, SlotLayer | null];
      next[slotIndex] = {
        ...slot,
        iframeKey,
        loading: true,
      };
      return next;
    });
  }
  hideSlots() {
    this.ui.setSlotOpacity([0, 0]);
  }
  transitionPending(url: string, identity: string, showingKey: string) {
    const active = this.slot(this.activeSlot);
    return (
      this.incomingSlot !== null ||
      (active !== null &&
        (active.previewURL !== url ||
          active.itemIdentity !== identity ||
          active.showingKey !== showingKey))
    );
  }
  updateSoftwareURLs(resolve: (slot: SlotLayer, index: SlotIndex) => string) {
    this.ui.setSlots(prev => {
      const next: Slots = [...prev];
      let changed = false;
      for (const index of [0, 1] as const) {
        const slot = next[index];
        if (!slot?.displayPreviewURL) {
          continue;
        }
        const displaySoftwareURL = resolve(slot, index);
        if (displaySoftwareURL !== slot.displaySoftwareURL) {
          next[index] = { ...slot, displaySoftwareURL };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }
  sourceEnded(index: SlotIndex, callback?: (identity: string) => void) {
    const slot = this.slot(index);
    if (
      slot &&
      slot.itemIdentity.length > 0 &&
      this.matchesTarget(slot.previewURL, slot.itemIdentity) &&
      slot.showingKey === this.composition.showingKey
    ) {
      callback?.(slot.itemIdentity);
    }
  }
  dispose() {
    clearTimeout(this.transitionTimeoutRef.current);
  }
}
