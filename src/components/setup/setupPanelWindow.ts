import { useEffect, useState } from 'react';
import { SetupDisplayDetail, SetupDisplayState } from '@/models/custom_event';

/**
 * How long the Wi-Fi join code stays over a work the Art Computer has saved
 * to display. The rule (feral-file/feral-file#3635, decided 2026-11-17): "An
 * Art Computer plugged in where it has no network displays what it displayed
 * last. The join code for Wi-Fi setup shows for about a minute after
 * power-on, then clears." Setup stays reachable because the daemon keeps the
 * hotspot up, and a power cycle starts a new minute.
 */
export const SETUP_PANEL_WINDOW_MS = 60_000;

/**
 * How the window treats one `setupDisplay` state.
 *
 * - `timed`: the plain join code. Clears after the window when there is a
 *   saved work to display.
 * - `hold`: someone is in the middle of setup. Never cleared, and the join
 *   code that follows it gets a fresh window.
 * - `untimed`: a panel that is never cleared (a join code that says why it
 *   is back, pairing, update, factory reset).
 * - `silent`: a narration-only state. No panel; the episode continues.
 * - `none`: no setup flow (hidden, ready, or a state this build does not
 *   know).
 */
export type SetupPanelKind = 'timed' | 'hold' | 'untimed' | 'silent' | 'none';

function joinCodeKind(display: SetupDisplayDetail): SetupPanelKind {
  // A phone on the hotspot is a person mid-setup. Known limit: the daemon in
  // FF OS 3.0.1 sends `client_attached` for Apple clients only, so the join
  // code can clear while an Android phone is on the hotspot. That phone
  // already has the setup page from its own captive-portal prompt; what it
  // loses is the typed fallback address on this panel, which a power cycle
  // brings back.
  if (display.client_attached === true) {
    return 'hold';
  }
  // The daemon puts `reason` on the join code only to say why the code is
  // back: a failed join or the attached phone leaving. This panel is the
  // only place that line shows, so it needs a person.
  return (display.reason?.trim() ?? '') === '' ? 'timed' : 'untimed';
}

/** Classifies a `setupDisplay` command for the window. */
export function setupPanelKind(display: SetupDisplayDetail): SetupPanelKind {
  switch (display.state as SetupDisplayState) {
    case SetupDisplayState.SoftApQr: {
      return joinCodeKind(display);
    }
    case SetupDisplayState.Joining: {
      return 'hold';
    }
    case SetupDisplayState.Updating:
    case SetupDisplayState.ClaimQr:
    case SetupDisplayState.FactoryReset: {
      return 'untimed';
    }
    case SetupDisplayState.Scanning:
    case SetupDisplayState.Connecting:
    case SetupDisplayState.Finalizing:
    case SetupDisplayState.JoinFailed:
    case SetupDisplayState.SetupError: {
      return 'silent';
    }
    default: {
      return 'none';
    }
  }
}

/**
 * What the window remembers within one no-network episode. `deadline` is null
 * until the episode's first join code appears.
 */
export interface SetupPanelClock {
  deadline: number | null;
  afterHold: boolean;
}

export const idleSetupPanelClock: SetupPanelClock = {
  deadline: null,
  afterHold: false,
};

export interface SetupPanelObservation {
  now: number;
  display: SetupDisplayDetail;
  online: boolean;
}

/**
 * Advances the window for one observation: a new `setupDisplay` command or a
 * connectivity change. Pure, so every timing case is unit-tested without a
 * component.
 *
 * The window counts from the episode's first join code. Repaints and later
 * hotspot phases do not extend it; the join code after a hold gets a fresh
 * one. An episode ends only when the device is online and the controller is
 * not narrating a no-network state, so a stale online flag or a `hidden`
 * while offline cannot bring the cleared code back.
 */
export function advanceSetupPanelClock(
  clock: SetupPanelClock,
  observation: SetupPanelObservation
): SetupPanelClock {
  const kind = setupPanelKind(observation.display);
  if (kind === 'hold') {
    return clock.afterHold ? clock : { ...clock, afterHold: true };
  }
  if (kind === 'timed') {
    const fresh = clock.deadline === null || clock.afterHold;
    return {
      deadline: fresh
        ? observation.now + SETUP_PANEL_WINDOW_MS
        : clock.deadline,
      afterHold: false,
    };
  }
  if (kind === 'silent') {
    return clock;
  }
  return observation.online ? idleSetupPanelClock : clock;
}

/**
 * True when the join code must not be painted: its window has passed, on a
 * unit with a saved work to display. A unit with nothing saved keeps it, and
 * `hold` and `untimed` panels are never cleared.
 */
export function isSetupPanelCleared(
  clock: SetupPanelClock,
  display: SetupDisplayDetail,
  hasSavedDisplay: boolean,
  now: number
): boolean {
  return (
    hasSavedDisplay &&
    setupPanelKind(display) === 'timed' &&
    clock.deadline !== null &&
    now >= clock.deadline
  );
}

interface TrackedClock {
  display: SetupDisplayDetail;
  online: boolean;
  clock: SetupPanelClock;
}

/**
 * Tracks the window for SetupOverlay and returns whether the current panel is
 * cleared. `display` must be a new object per `setupDisplay` command (it is
 * the event detail), so a re-sent state is still observed.
 *
 * The clock advances during render, not in an effect: a join code that earns
 * a fresh window (after a hold) must paint on the same commit as its command
 * instead of blinking hidden for a frame.
 */
export function useSetupPanelCleared(
  display: SetupDisplayDetail,
  hasSavedDisplay: boolean,
  online: boolean
): boolean {
  const [tracked, setTracked] = useState<TrackedClock | null>(null);
  let clock = tracked?.clock ?? idleSetupPanelClock;
  if (tracked?.display !== display || tracked.online !== online) {
    clock = advanceSetupPanelClock(clock, {
      // Monotonic: the device's wall clock jumps on its first network sync.
      now: performance.now(),
      display,
      online,
    });
    setTracked({ display, online, clock });
  }

  // The deadline that has passed, recorded by the timer so the clearing
  // render does not depend on timer and clock rounding agreeing.
  const [lapsed, setLapsed] = useState<number | null>(null);
  const { deadline } = clock;
  useEffect(() => {
    if (deadline === null) {
      return undefined;
    }
    const timer = setTimeout(
      () => {
        setLapsed(deadline);
      },
      Math.max(0, deadline - performance.now())
    );
    return () => {
      clearTimeout(timer);
    };
  }, [deadline]);

  const now = lapsed === deadline && deadline !== null ? deadline : 0;
  return isSetupPanelCleared(clock, display, hasSavedDisplay, now);
}
