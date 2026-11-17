import { useEffect, useState } from 'react';
import { SetupDisplayDetail, SetupDisplayState } from '@/models/custom_event';

/**
 * How long a no-network setup panel stays over a work the Art Computer has
 * saved to display. The rule (feral-file/feral-file#3635, decided 2026-11-17):
 * "An Art Computer plugged in where it has no network displays what it
 * displayed last. The join code for Wi-Fi setup shows for about a minute after
 * power-on, then clears." Setup stays reachable because the daemon keeps the
 * hotspot up, and a power cycle starts a new minute.
 */
export const SETUP_PANEL_WINDOW_MS = 60_000;

/**
 * How the window treats one `setupDisplay` state.
 *
 * - `timed`: no-network narration and the join code. Clears after the window
 *   when there is a saved work to display.
 * - `hold`: someone is in the middle of setup. Never cleared, and the timed
 *   panel that follows it gets a fresh window.
 * - `untimed`: needs a person or must not be interrupted (pairing, errors,
 *   update, factory reset). Never cleared.
 * - `none`: nothing is painted.
 */
export type SetupPanelKind = 'timed' | 'hold' | 'untimed' | 'none';

/**
 * Classifies a `setupDisplay` command for the window. Unknown future states
 * read as `none`, matching `renderSetupPanel`, which paints nothing for them.
 */
export function setupPanelKind(display: SetupDisplayDetail): SetupPanelKind {
  switch (display.state as SetupDisplayState) {
    case SetupDisplayState.SoftApQr: {
      // A phone on the hotspot is a person mid-setup, whether or not the
      // panel can swap to the portal code.
      return display.client_attached === true ? 'hold' : 'timed';
    }
    case SetupDisplayState.Scanning:
    case SetupDisplayState.Connecting: {
      return 'timed';
    }
    case SetupDisplayState.Joining:
    case SetupDisplayState.Finalizing: {
      return 'hold';
    }
    // join_failed stays untimed: after a failed join the daemon repaints the
    // join code within a millisecond, and its other use (a failed pre-claim
    // update) is an error a person has to see.
    case SetupDisplayState.JoinFailed:
    case SetupDisplayState.SetupError:
    case SetupDisplayState.Updating:
    case SetupDisplayState.ClaimQr:
    case SetupDisplayState.FactoryReset: {
      return 'untimed';
    }
    default: {
      return 'none';
    }
  }
}

/**
 * What the window remembers within one no-network episode. `deadline` is null
 * while no episode is open.
 */
export interface SetupPanelClock {
  deadline: number | null;
  joinCodeShown: boolean;
  afterHold: boolean;
}

export const idleSetupPanelClock: SetupPanelClock = {
  deadline: null,
  joinCodeShown: false,
  afterHold: false,
};

export interface SetupPanelObservation {
  now: number;
  playerStartedAt: number;
  display: SetupDisplayDetail;
  online: boolean;
}

function timedDeadline(
  clock: SetupPanelClock,
  observation: SetupPanelObservation
): number {
  const { now, playerStartedAt, display } = observation;
  const fresh = now + SETUP_PANEL_WINDOW_MS;
  // An episode already under way at power-on counts from player start; one
  // that begins later counts from when its panel first appears.
  const bootDeadline = playerStartedAt + SETUP_PANEL_WINDOW_MS;
  let deadline = clock.deadline ?? (now < bootDeadline ? bootDeadline : fresh);
  const firstJoinCode =
    display.state === (SetupDisplayState.SoftApQr as string) &&
    !clock.joinCodeShown;
  // The daemon raises the hotspot 30 seconds to 5 minutes after power-on, so
  // the first join code of an episode gets the whole window from when it
  // appears. Repaints and later hotspot phases do not extend it.
  if (firstJoinCode || clock.afterHold) {
    deadline = Math.max(deadline, fresh);
  }
  return deadline;
}

/**
 * Advances the window for one observation: a new `setupDisplay` command or a
 * connectivity change. Pure, so every timing case is unit-tested without a
 * component.
 *
 * An episode ends only when the device is online and no setup-flow panel is
 * showing. A stale online flag therefore cannot reset the window while the
 * daemon is still narrating a no-network state, and a `hidden` between
 * hotspot phases does not end the episode while the device is offline.
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
    return {
      deadline: timedDeadline(clock, observation),
      joinCodeShown:
        clock.joinCodeShown ||
        observation.display.state === (SetupDisplayState.SoftApQr as string),
      afterHold: false,
    };
  }
  return observation.online ? idleSetupPanelClock : clock;
}

/**
 * True when the panel for `display` must not be painted: a timed panel whose
 * window has passed, on a unit with a saved work to display. A unit with
 * nothing saved keeps every setup panel, as do `hold` and `untimed` states.
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

// `performance.now()` counts from page load, which is player start, and does
// not jump when the device's wall clock is set after a first network sync.
const playerStartedAt = 0;

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
 * The clock advances during render, not in an effect: a panel that earns a
 * fresh window (a failed join after the first minute) must paint on the same
 * commit as its command instead of blinking hidden for a frame.
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
      now: performance.now(),
      playerStartedAt,
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
