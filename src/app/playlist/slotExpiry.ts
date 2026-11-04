import { RenderStatus } from '@/models';

/** How often an expired slot re-checks a still-loading artwork. */
export const SLOT_EXPIRY_RECHECK_MS = 1_000;
/** Upper bound on holding an expired slot for its artwork to finish loading. */
export const SLOT_EXPIRY_MAX_DEFER_MS = 10 * 60_000;

export type SlotExpiryDecision = 'advance' | 'defer' | 'restart';

/**
 * Decides what an expired slot timer does.
 *
 * The slot timer starts when an item is selected, not when it appears, so a
 * work that loads for longer than its duration used to be advanced past
 * before it was ever on the wall. Expiry therefore waits while the renderer
 * reports `loading`, and once that work becomes ready it gets its full
 * duration on screen.
 *
 * Only a bounded `loading` defers. `loading` is published solely by a
 * mounted renderer whose load has run past the overlay delay
 * (ArtworkRecovery.markArtworkLoading), whereas `pending` is also set by
 * Canvas for selections no renderer may ever answer. `loadBounded` means the
 * load has a stuck-load watchdog that will end it; HLS has none (a stalled
 * live stream may never fail), so a stream keeps its old pacing: the slot
 * timer is what ends it. An ordinary load that finishes before expiry never
 * reaches this wait, so normal pacing is unchanged. A failed or unanswered
 * load advances exactly as it did before, and SLOT_EXPIRY_MAX_DEFER_MS bounds
 * the wait regardless.
 *
 * @param input.renderStatus - The renderer's current status.
 * @param input.loadBounded - Whether that load has a stuck-load bound.
 * @param input.deferredFor - Milliseconds already spent waiting, or null on
 *   the timer's first expiry.
 * @returns `defer` to check again later, `restart` to give the now-ready work
 *   a full slot, or `advance` for the ordinary expiry path.
 */
export function decideSlotExpiry(input: {
  renderStatus: RenderStatus | undefined;
  loadBounded: boolean;
  deferredFor: number | null;
}): SlotExpiryDecision {
  const { renderStatus, loadBounded, deferredFor } = input;
  if (
    renderStatus === RenderStatus.loading &&
    loadBounded &&
    (deferredFor ?? 0) < SLOT_EXPIRY_MAX_DEFER_MS
  ) {
    return 'defer';
  }
  if (deferredFor !== null && renderStatus === RenderStatus.ready) {
    return 'restart';
  }
  return 'advance';
}
