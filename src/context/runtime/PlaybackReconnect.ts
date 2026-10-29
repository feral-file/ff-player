import { canvasService } from '@/services/CanvasService';
const REFRESH_BUDGET_MAX_ATTEMPTS = 3;
const REFRESH_BUDGET_BACKOFF_MS = [15_000, 60_000, 240_000];
const REFRESH_BUDGET_SETTLE_MS = 60_000;
const REFRESH_BUDGET_MAX_AGE_MS = 10 * 60_000;
/** Owns M7's per-URL retry budget and its active timer, independently of the renderer's per-mount retries. */
export class PlaybackReconnect {
  private reportedURL: string | null = null;
  private budget: { url: string; attempts: number; startedAt: number } | null =
    null;
  private clearedAt: number | null = null;
  private nextAttemptAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private wasOnline: boolean) {}
  report(degraded: boolean, url?: string) {
    this.reportedURL = degraded ? (url ?? null) : null;
  }
  clearTimer = () => {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  };
  /**
   * Recovery does not require isOnline: its delivery depends on daemon health.
   * A true online edge resets the budget; repeated notifications only recheck it.
   */
  update(playbackDegraded: boolean, isOnline: boolean) {
    const edge = isOnline && !this.wasOnline;
    this.wasOnline = isOnline;
    this.clearTimer();
    this.check(playbackDegraded, edge);
    return this.clearTimer;
  }
  private check(playbackDegraded: boolean, trueOnlineEdge: boolean) {
    const now = Date.now();

    if (!playbackDegraded) {
      this.clearedAt ??= now;
      return;
    }

    const url = this.reportedURL;
    const clearedAt = this.clearedAt;
    this.clearedAt = null;
    const settled =
      clearedAt !== null && now - clearedAt >= REFRESH_BUDGET_SETTLE_MS;

    let activeBudget = this.budget;
    const urlChanged = url !== null && activeBudget?.url !== url;
    const aged =
      activeBudget !== null &&
      now - activeBudget.startedAt >= REFRESH_BUDGET_MAX_AGE_MS;

    if (!activeBudget || urlChanged || trueOnlineEdge || settled || aged) {
      activeBudget = {
        url: url ?? activeBudget?.url ?? '',
        attempts: 0,
        startedAt: now,
      };
      this.budget = activeBudget;
      // A fresh budget gets a fresh attempt — a stale backoff computed
      // against the PREVIOUS episode must not gate the first attempt of a
      // new one (a different URL, a genuine online edge, a settled clear,
      // or the age valve all warrant an immediate try).
      this.nextAttemptAt = 0;
    }

    const budgetExhausted =
      activeBudget.attempts >= REFRESH_BUDGET_MAX_ATTEMPTS;
    const backoffGated = now < this.nextAttemptAt;

    if (!budgetExhausted && !backoffGated) {
      console.log('[AppContext] Degraded playback, refreshing artwork');
      canvasService.requestArtworkRefresh();
      activeBudget.attempts += 1;
      const backoffIndex = Math.min(
        activeBudget.attempts - 1,
        REFRESH_BUDGET_BACKOFF_MS.length - 1
      );
      this.nextAttemptAt = now + REFRESH_BUDGET_BACKOFF_MS[backoffIndex];
    }

    // Same-URL repeat failures are deduplicated before reaching context, so
    // neither another React render nor another online notification is assured.
    // This timer is the primary re-entry trigger: even a gated run rearms for
    // the next attempt or age reset. The refresh may have exhausted the budget.
    const stillBudgetExhausted =
      activeBudget.attempts >= REFRESH_BUDGET_MAX_ATTEMPTS;
    const ageDeadline = activeBudget.startedAt + REFRESH_BUDGET_MAX_AGE_MS;
    const nextDeadline = stillBudgetExhausted
      ? ageDeadline
      : Math.min(this.nextAttemptAt, ageDeadline);
    const delay = Math.max(0, nextDeadline - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check(playbackDegraded, false);
    }, delay);
  }
}
