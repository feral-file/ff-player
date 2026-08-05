/**
 * Last connectivity verdict pushed by the device daemon (controld), held at
 * module level so it survives React mount timing.
 *
 * Why this exists: the daemon's `window.handleConnectivityChange` pushes are
 * the device's only authoritative online/offline signal, but they are
 * delivered as window CustomEvents — anything not yet listening simply misses
 * them, and `useNetworkManger`'s optimistic `true` seed then stands
 * uncorrected for the rest of the page lifetime. Field incident (FF1,
 * 2026-08-05): a Chromium cold start while offline with the setup AP up had
 * the daemon's generation-ready replay arrive 7ms AFTER content-type
 * detection had already classified its failure, and `navigator.onLine` read
 * `true` the whole time (the device's own hotspot keeps the interface up), so
 * the offline backdrop never rose and the wall stayed black. This store
 * closes both halves: consumers seed from the last-known verdict instead of
 * guessing, and classification sites can WAIT briefly for the first verdict
 * instead of misreading "no verdict yet" as "online".
 *
 * `null` means "no daemon verdict yet this page lifetime". Standalone/dev
 * browsers have no daemon and stay `null` forever, so every consumer must
 * treat `null` as "unknown" — never as "online" or "offline".
 *
 * The store is deliberately NOT aged and NOT cleared by
 * `CDPRequestHandler.cleanup()`: a verdict is a page-lifetime fact, its
 * staleness is bounded by the daemon replaying its level on every
 * generation-ready (each reload/reconnect refreshes it), and clearing on
 * handler teardown would discard the seed exactly when a remounting
 * AppProvider is about to need it.
 */
let lastVerdict: boolean | null = null;

/** Pending waitForDaemonConnectivity resolvers, flushed on the next verdict. */
const waiters = new Set<(verdict: boolean) => void>();

/**
 * Record a daemon connectivity push. Called by CDPRequestHandler before it
 * dispatches the window event, so the store is already current for any
 * consumer the event wakes up.
 */
export function noteDaemonConnectivity(isOnline: boolean): void {
  lastVerdict = isOnline;
  // Snapshot-then-clear so a waiter that (indirectly) arms a new wait during
  // its callback lands in the NEXT flush, not this one. Array.from, not
  // spread: the tsconfig target predates Set iteration.
  const pending = Array.from(waiters);
  waiters.clear();
  pending.forEach(notify => {
    notify(isOnline);
  });
}

/** Last daemon verdict, or `null` when none has arrived this page lifetime. */
export function daemonConnectivity(): boolean | null {
  return lastVerdict;
}

/**
 * Resolve with the daemon's verdict: immediately when one is already known,
 * otherwise with the FIRST verdict to arrive within `timeoutMs`, or `null` on
 * timeout (no daemon, or it has not spoken yet). The timeout is the caller's
 * bound on how long "unknown" may stall a decision — see the corroboration
 * site in `getContentTypeFromURL` for the trade-off.
 */
export function waitForDaemonConnectivity(
  timeoutMs: number
): Promise<boolean | null> {
  if (lastVerdict !== null) {
    return Promise.resolve(lastVerdict);
  }
  return new Promise(resolve => {
    const notify = (verdict: boolean) => {
      clearTimeout(timer);
      resolve(verdict);
    };
    const timer = setTimeout(() => {
      waiters.delete(notify);
      resolve(null);
    }, timeoutMs);
    waiters.add(notify);
  });
}

/**
 * Test-only: return the store to its pristine "no verdict yet" state.
 * Module-level state leaks across vitest cases in the same file otherwise.
 */
export function resetDaemonConnectivityForTests(): void {
  lastVerdict = null;
  waiters.clear();
}
