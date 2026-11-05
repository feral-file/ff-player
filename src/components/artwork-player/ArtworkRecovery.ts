import { PreviewHTMLTag, RenderStatus } from '@/models';
import type { PlaybackFailure } from '@/models/media_health.model';
import { canvasService } from '@/services/CanvasService';
import type { Dispatch, SetStateAction } from 'react';
import { ArtworkOutcomeReporter } from './ArtworkOutcomes';
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
  // mediaHealth contract v1: every attempt decision below reports here. The
  // attempt number is the failure budget's own counter, so the ring and the
  // retry/skip rule can never disagree about which try a verdict belongs to.
  private readonly outcomes = new ArtworkOutcomeReporter();
  // The attempt this mount IS, fixed at beginMount from the budget counter.
  // Every outcome of the mount carries it: a failure bumps the counter at
  // once and a success zeroes it, so reading the counter at report time
  // would label a late success in the same mount as a retry that never ran,
  // or a crossfade's ready (up to 650 ms after acceptance) as attempt 1.
  private mountAttempt = 1;
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
  /** The 1-based attempt the current mount's verdicts belong to. */
  private get attempt() {
    return this.mountAttempt;
  }
  /** MIME detection settled: the ring labels this mount's entries with the renderer. */
  noteMediaType(previewType: PreviewHTMLTag | null) {
    this.outcomes.noteMediaType(previewType);
  }
  /**
   * The content-type probe answered without a usable type. Recorded even when
   * playback carries on through the iframe fallback, because that fallback
   * reports `ready` for a gateway's error page; controld needs the status to
   * see past it. `network` is reported only once offline is corroborated.
   */
  noteDetectFailure(code: string) {
    this.outcomes.report({
      kind: 'fail',
      stage: 'detect',
      code,
      attempt: this.attempt,
    });
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
    this.outcomes.report({ kind: 'ok', stage: 'ready', attempt: this.attempt });
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
      this.outcomes.report({
        kind: 'fail',
        stage: 'exhausted',
        code: String(ARTWORK_FAILURE_RETRY_LIMIT),
        attempt: this.artworkFailureCountRef.current,
      });
      this.artworkFailureCountRef.current = 0;
      this.artworkFailureStuckByWebGLRef.current = null;
      this.onArtworkExhausted?.(this.itemIdentityRef.current);
    }
  }
  /** A new attempt cancels a parked retry without resetting the per-item budget. */
  beginMount() {
    this.cancelRetry();
    this.mountAttempt = this.artworkFailureCountRef.current + 1;
    this.outcomes.beginAttempt(this.previewURLRef.current);
    // Unbounded until the new element's watchdog says otherwise: the
    // conservative default lets an expired slot advance as it always did.
    canvasService.setRenderLoadBounded(false);
    this.markArtworkPending();
    this.armLoadingDelay();
  }
  /** Records whether the current mount's load is ended by a watchdog. */
  markLoadBounded(bounded: boolean) {
    canvasService.setRenderLoadBounded(bounded);
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
  /**
   * A terminal load failure for the current attempt. The caller names the
   * stage it saw (watchdog, element error, decode code, ...); the entry is
   * recorded only on the transition into `failed`, so competing failure
   * signals for one attempt produce one ring entry, charged to one retry.
   */
  fail(outcome: PlaybackFailure) {
    if (this.status === RenderStatus.failed) {
      return;
    }
    this.outcomes.report({ kind: 'fail', ...outcome, attempt: this.attempt });
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
    // Device-local by contract: controld records it, never as a source verdict.
    this.outcomes.report({
      kind: 'fail',
      stage: 'webgl',
      code: 'context_lost',
      attempt: this.attempt,
    });
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
    canvasService.setRenderLoadBounded(false);
    this.renderStatusRef.current = undefined;
  }
}
