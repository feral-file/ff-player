import type { ArtworkRecovery } from './ArtworkRecovery';
import type { ArtworkTransition } from './ArtworkTransition';
import type { SlotIndex, SlotLayer } from './artworkTypes';
import type { MediaEvents } from './SlotMediaResources';
import type { WebGLRecovery } from './useWebGLRecovery';

/** Translates each media type's completion signal without conflating readiness and degradation. */
export class ArtworkLoadEvents {
  constructor(
    private readonly transition: ArtworkTransition,
    private readonly recovery: ArtworkRecovery,
    private readonly webGL: WebGLRecovery,
    private readonly note: MediaEvents['note']
  ) {}
  iframeLoaded(index: SlotIndex, layer: SlotLayer) {
    if (!this.webGL.available()) {
      this.webGL.lost();
      return;
    }
    this.recovery.hideMessage();
    if (
      this.transition.loadedSource(index, layer) &&
      this.transition.slot(index)?.mimeType !== null
    ) {
      this.note(this.transition.slot(index)?.previewURL ?? '', false);
    }
  }
  modelLoaded(index: SlotIndex, layer: SlotLayer) {
    if (!this.transition.loadedSource(index, layer)) {
      return;
    }
    this.note(this.transition.slot(index)?.previewURL ?? '', false);
    this.recovery.hideMessage();
  }
  modelFailed(index: SlotIndex, layer: SlotLayer) {
    if (!this.transition.loadedSource(index, layer, false)) {
      return;
    }
    this.note(this.transition.slot(index)?.previewURL ?? '', true);
    this.recovery.clearLoadingIndicators();
    this.recovery.fail();
  }
  iframeFailed(index: SlotIndex, layer: SlotLayer) {
    if (!this.transition.loadedSource(index, layer, false)) {
      return;
    }
    this.note(this.transition.slot(index)?.previewURL ?? '', true);
    this.transition.fail(index, layer);
  }
}
