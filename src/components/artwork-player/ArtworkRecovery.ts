import { RenderStatus } from '@/models';
import { canvasService } from '@/services/CanvasService';
import type { Dispatch, SetStateAction } from 'react';
type Setter<T> = Dispatch<SetStateAction<T>>;
export interface RecoveryUI {
  setGlobalLoading: Setter<boolean>;
  setShowLoading: Setter<boolean>;
  setShowMessageModal: Setter<boolean>;
  setMessageModalText: Setter<string | null>;
  setMessageModalTitle: Setter<string | null>;
}
const ARTWORK_FAILURE_RETRY_LIMIT = 3;
const ARTWORK_FAILURE_RETRY_DELAY_MS = 3000;
export const RENDER_LOADING_DELAY_MS = 2000;
/** Owns the mount lifecycle, overlay delay, and per-item failure budget. React owns the visible snapshot; timer state stays private here. */
export class ArtworkRecovery {
  private renderStatusRef: { current: RenderStatus | undefined } = {
    current: undefined,
  };
  private loadingDelayRef: { current: NodeJS.Timeout | undefined } = {
    current: undefined,
  };
  private artworkFailureCountRef = { current: 0 };
  private artworkFailureRetryTimeoutRef: {
    current: NodeJS.Timeout | undefined;
  } = { current: undefined };
  private artworkFailureStuckByWebGLRef: {
    current: { identity: string; url: string } | null;
  } = { current: null };
  private isWebGLContextLost = { current: false };
  private previewURLRef = { current: '' };
  private itemIdentityRef = { current: '' };
  private onArtworkExhausted?: (identity: string) => void;
  constructor(
    private readonly ui: RecoveryUI,
    private readonly performArtworkReload: () => void
  ) {}
  updateTarget(
    url: string,
    identity: string,
    exhausted?: (identity: string) => void
  ) {
    this.previewURLRef.current = url;
    this.itemIdentityRef.current = identity;
    this.onArtworkExhausted = exhausted;
  }
  get status() {
    return this.renderStatusRef.current;
  }
  get recoveringWebGL() {
    return this.isWebGLContextLost.current;
  }
  clearLoadingDelay() {
    if (!this.loadingDelayRef.current) {
      return;
    }
    clearTimeout(this.loadingDelayRef.current);
    this.loadingDelayRef.current = undefined;
  }
  markArtworkPending() {
    if (this.renderStatusRef.current === RenderStatus.pending) {
      return;
    }
    this.renderStatusRef.current = RenderStatus.pending;
    canvasService.setRenderStatus(RenderStatus.pending);
    this.ui.setGlobalLoading(true);
    this.ui.setShowLoading(false);
    this.ui.setShowMessageModal(false);
    this.ui.setMessageModalText(null);
    this.ui.setMessageModalTitle(null);
  }
  markArtworkLoading() {
    if (this.renderStatusRef.current === RenderStatus.loading) {
      return;
    }
    this.renderStatusRef.current = RenderStatus.loading;
    canvasService.setRenderStatus(RenderStatus.loading);
    this.ui.setGlobalLoading(true);
    this.ui.setShowLoading(true);
  }
  markArtworkReady(committedAsFailure: boolean) {
    if (this.renderStatusRef.current === RenderStatus.ready) {
      return;
    }
    if (
      this.renderStatusRef.current === RenderStatus.failed &&
      committedAsFailure
    ) {
      return;
    }
    this.renderStatusRef.current = RenderStatus.ready;
    canvasService.setRenderStatus(RenderStatus.ready);
    this.ui.setGlobalLoading(false);
    this.ui.setShowLoading(false);
    this.clearLoadingDelay();
    this.ui.setShowMessageModal(false);
    this.ui.setMessageModalText(null);
    this.ui.setMessageModalTitle(null);
    this.artworkFailureCountRef.current = 0;
  }
  markArtworkFailed() {
    if (this.renderStatusRef.current === RenderStatus.failed) {
      return;
    }
    this.renderStatusRef.current = RenderStatus.failed;
    canvasService.setRenderStatus(RenderStatus.failed);
    this.ui.setGlobalLoading(false);
    this.ui.setShowLoading(false);
    this.clearLoadingDelay();
  }
  armScheduledRetry() {
    const retryIdentity = this.itemIdentityRef.current;
    const retryURL = this.previewURLRef.current;
    this.artworkFailureRetryTimeoutRef.current = setTimeout(() => {
      this.artworkFailureRetryTimeoutRef.current = undefined;
      if (
        this.itemIdentityRef.current !== retryIdentity ||
        this.previewURLRef.current !== retryURL
      ) {
        return;
      }
      if (this.isWebGLContextLost.current) {
        this.artworkFailureStuckByWebGLRef.current = {
          identity: retryIdentity,
          url: retryURL,
        };
        return;
      }
      this.performArtworkReload();
    }, ARTWORK_FAILURE_RETRY_DELAY_MS);
  }
  scheduleArtworkFailureRetryOrSkip() {
    this.artworkFailureCountRef.current += 1;
    if (this.artworkFailureRetryTimeoutRef.current) {
      clearTimeout(this.artworkFailureRetryTimeoutRef.current);
    }
    if (this.artworkFailureCountRef.current < ARTWORK_FAILURE_RETRY_LIMIT) {
      this.armScheduledRetry();
    } else {
      this.artworkFailureCountRef.current = 0;
      this.artworkFailureStuckByWebGLRef.current = null;
      this.onArtworkExhausted?.(this.itemIdentityRef.current);
    }
  }
  /** A new attempt cancels a parked retry without resetting the per-item budget. */
  beginMount() {
    this.cancelRetry();
    this.markArtworkPending();
    this.armLoadingDelay();
  }
  armLoadingDelay() {
    this.clearLoadingDelay();
    const url = this.previewURLRef.current;
    this.loadingDelayRef.current = setTimeout(() => {
      if (
        this.previewURLRef.current === url &&
        this.status === RenderStatus.pending
      ) {
        this.markArtworkLoading();
      }
    }, RENDER_LOADING_DELAY_MS);
  }
  cancelRetry() {
    if (this.artworkFailureRetryTimeoutRef.current) {
      clearTimeout(this.artworkFailureRetryTimeoutRef.current);
    }
    this.artworkFailureRetryTimeoutRef.current = undefined;
  }
  acceptSuccess() {
    this.cancelRetry();
    this.artworkFailureCountRef.current = 0;
    this.artworkFailureStuckByWebGLRef.current = null;
  }
  resetItem() {
    this.cancelRetry();
    this.artworkFailureCountRef.current = 0;
  }
  clearLoadingIndicators() {
    this.ui.setGlobalLoading(false);
    this.ui.setShowLoading(false);
    this.clearLoadingDelay();
  }
  hideMessage() {
    this.ui.setShowMessageModal(false);
  }
  fail() {
    if (this.status === RenderStatus.failed) {
      return;
    }
    this.markArtworkFailed();
    this.scheduleArtworkFailureRetryOrSkip();
    this.ui.setMessageModalText(null);
    this.ui.setMessageModalTitle(
      'The artwork cannot be displayed correctly on this device.'
    );
    this.ui.setShowMessageModal(true);
  }
  beginWebGLRecovery() {
    if (this.recoveringWebGL) {
      return false;
    }
    this.isWebGLContextLost.current = true;
    this.markArtworkFailed();
    this.ui.setMessageModalText(
      'Please wait while your Art Computer restores the artwork.'
    );
    this.ui.setMessageModalTitle('Restoring artwork');
    this.ui.setShowMessageModal(true);
    return true;
  }
  finishWebGLRecovery(timedOut: boolean) {
    this.isWebGLContextLost.current = false;
    if (timedOut) {
      this.ui.setMessageModalText(null);
      this.ui.setMessageModalTitle(
        'Couldn’t restore this artwork. Try another work.'
      );
    }
    this.resumeRetryStuckByWebGL();
  }
  resumeRetryStuckByWebGL() {
    const stuckItem = this.artworkFailureStuckByWebGLRef.current;
    if (
      stuckItem?.identity === this.itemIdentityRef.current &&
      stuckItem.url === this.previewURLRef.current &&
      this.renderStatusRef.current === RenderStatus.failed
    ) {
      this.artworkFailureStuckByWebGLRef.current = null;
      this.armScheduledRetry();
    }
  }
  dispose() {
    this.clearLoadingDelay();
    canvasService.setRenderStatus(undefined);
    this.renderStatusRef.current = undefined;
  }
}
