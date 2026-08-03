'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { RenderStatus } from '@/models';
import {
  RENDER_WATCHDOG_FAILURE_GRACE_MS,
  RENDER_WATCHDOG_LOAD_TIMEOUT_MS,
} from '@/constants';

/**
 * Why the watchdog force-advanced the current slot.
 * - `stuck-load`: the slot never reached `ready` or `failed` within the load
 *   budget (white screen / renderer that never paints / hung load).
 * - `render-failed`: the slot reported `failed` and, being a no-duration item,
 *   has no other advance trigger, so it would park on the error modal forever.
 */
export type WatchdogReason = 'stuck-load' | 'render-failed';

interface UseRenderWatchdogOptions {
  /** Force-advance the current slot. `reason` is for logging/telemetry only. */
  onForceAdvance: (reason: WatchdogReason) => void;
  /** Remote-config kill-switch (ff-app#520). Defaults to enabled. */
  enabled?: boolean;
  /** Overridable for tests. */
  loadTimeoutMs?: number;
  failureGraceMs?: number;
}

export interface RenderWatchdog {
  /**
   * (Re)arm the watchdog for a freshly-entered slot.
   *
   * Only slots with no duration timer are watched — pass `watch: false` for a
   * has-duration slot, whose duration timer is already its advance backstop.
   * `identity` distinguishes slots so a stale status event from the previous
   * slot cannot fire the current one's timers.
   */
  armForSlot: (params: { identity: string; watch: boolean }) => void;
  /** Feed render-status transitions; wire to `ArtworkPlayer.onRenderStatusChange`. */
  onRenderStatusChange: (status: RenderStatus | undefined) => void;
  /** Clear all pending timers (playlist cleared, paused, or unmounted). */
  disarm: () => void;
}

/**
 * Defense-in-depth watchdog for a wedged playlist slot (ff-app#520, Layers C+D).
 *
 * The duration timer and source-end events in PlaylistClient rotate healthy
 * works, but they cannot recover a slot that (a) has no duration timer armed and
 * (b) never emits an `ended` event. Two such cases park the device forever:
 *   - a load that never reaches `ready`/`failed` (stuck load), and
 *   - a no-duration item that reports `failed` (advance had only `ended` to rely
 *     on, and `ended` never fires on a failed load).
 * This hook force-advances those slots after a bounded grace.
 *
 * It deliberately watches ONLY no-duration slots and disarms the moment a slot
 * reaches `ready`, so a healthy work — including a legitimately long or
 * infinitely-looping generator that renders fine — is never cut short. A work
 * that renders and *then* wedges is out of scope here (that needs renderer
 * liveness detection at the OS layer — ff-app#520 Layer B).
 */
// eslint-disable-next-line max-lines-per-function -- one cohesive timer state machine; splitting it would scatter the shared refs.
export function useRenderWatchdog({
  onForceAdvance,
  enabled = true,
  loadTimeoutMs = RENDER_WATCHDOG_LOAD_TIMEOUT_MS,
  failureGraceMs = RENDER_WATCHDOG_FAILURE_GRACE_MS,
}: UseRenderWatchdogOptions): RenderWatchdog {
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const failureTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  // The slot currently being watched; null when idle. A status event whose
  // identity no longer matches belongs to a slot we already advanced past.
  const watchedIdentityRef = useRef<string | null>(null);
  // The last slot identity that reached `ready`. A re-arm for the same slot
  // (e.g. the merge-landed re-arm that resolves display preferences) must not
  // restart the load timer for an item that already rendered fine.
  const settledReadyIdentityRef = useRef<string | null>(null);

  // Keep the latest config/callback without re-creating the stable callbacks
  // below, so wiring them into effects never re-arms the timers.
  const onForceAdvanceRef = useRef(onForceAdvance);
  onForceAdvanceRef.current = onForceAdvance;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const loadTimeoutMsRef = useRef(loadTimeoutMs);
  loadTimeoutMsRef.current = loadTimeoutMs;
  const failureGraceMsRef = useRef(failureGraceMs);
  failureGraceMsRef.current = failureGraceMs;

  const clearTimers = useCallback(() => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = undefined;
    }
    if (failureTimerRef.current) {
      clearTimeout(failureTimerRef.current);
      failureTimerRef.current = undefined;
    }
  }, []);

  const disarm = useCallback(() => {
    clearTimers();
    watchedIdentityRef.current = null;
  }, [clearTimers]);

  const fire = useCallback(
    (reason: WatchdogReason) => {
      // One-shot: stop watching before advancing so a trailing status event
      // (or the other timer) cannot fire a second advance for the same slot.
      disarm();
      onForceAdvanceRef.current(reason);
    },
    [disarm]
  );

  const armForSlot = useCallback(
    ({ identity, watch }: { identity: string; watch: boolean }) => {
      clearTimers();
      if (!enabledRef.current || !watch) {
        watchedIdentityRef.current = null;
        return;
      }
      // Already rendered fine on a prior arm for this same slot (a merge-landed
      // re-arm): stay disarmed so a healthy no-duration item is never advanced
      // long after it painted.
      if (identity === settledReadyIdentityRef.current) {
        watchedIdentityRef.current = null;
        return;
      }
      watchedIdentityRef.current = identity;
      loadTimerRef.current = setTimeout(() => {
        fire('stuck-load');
      }, loadTimeoutMsRef.current);
    },
    [clearTimers, fire]
  );

  const onRenderStatusChange = useCallback(
    (status: RenderStatus | undefined) => {
      if (watchedIdentityRef.current === null) {
        return;
      }
      if (status === RenderStatus.ready) {
        // Rendered fine — remember this slot and stop watching it, so a later
        // re-arm cannot resurrect the timer. A subsequent hang is Layer B's job.
        settledReadyIdentityRef.current = watchedIdentityRef.current;
        disarm();
        return;
      }
      if (status === RenderStatus.failed) {
        // No duration timer and no `ended` will ever come; advance after a grace
        // that still lets the render layer recover to `ready` first.
        if (failureTimerRef.current) {
          return;
        }
        if (loadTimerRef.current) {
          clearTimeout(loadTimerRef.current);
          loadTimerRef.current = undefined;
        }
        failureTimerRef.current = setTimeout(() => {
          fire('render-failed');
        }, failureGraceMsRef.current);
      }
      // pending/loading/undefined: keep waiting on the load timer.
    },
    [disarm, fire]
  );

  useEffect(() => clearTimers, [clearTimers]);

  // Stable object identity: the three callbacks are stable, so consumers can
  // safely list `watchdog` in effect/callback dependency arrays without
  // re-running them (and re-arming timers) on every render.
  return useMemo(
    () => ({ armForSlot, onRenderStatusChange, disarm }),
    [armForSlot, onRenderStatusChange, disarm]
  );
}
