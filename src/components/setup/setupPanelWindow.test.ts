import { describe, expect, it } from 'vitest';
import { SetupDisplayDetail, SetupDisplayState } from '@/models/custom_event';
import {
  SETUP_PANEL_WINDOW_MS,
  SetupPanelClock,
  advanceSetupPanelClock,
  idleSetupPanelClock,
  isSetupPanelCleared,
  setupPanelKind,
} from './setupPanelWindow';

const connecting: SetupDisplayDetail = { state: SetupDisplayState.Connecting };
const scanning: SetupDisplayDetail = { state: SetupDisplayState.Scanning };
const joinCode: SetupDisplayDetail = {
  state: SetupDisplayState.SoftApQr,
  ssid: 'FF1-ABCD',
};
const attached: SetupDisplayDetail = { ...joinCode, client_attached: true };
const joining: SetupDisplayDetail = { state: SetupDisplayState.Joining };
const hidden: SetupDisplayDetail = { state: SetupDisplayState.Hidden };

/** Feeds observations in order, offline unless stated. */
function run(
  steps: [now: number, display: SetupDisplayDetail, online?: boolean][],
  from: SetupPanelClock = idleSetupPanelClock
): SetupPanelClock {
  return steps.reduce(
    (clock, [now, display, online]) =>
      advanceSetupPanelClock(clock, {
        now,
        display,
        online: online ?? false,
      }),
    from
  );
}

describe('setupPanelKind', () => {
  it('maps every known state', () => {
    const kinds = Object.fromEntries(
      Object.values(SetupDisplayState).map(state => [
        state,
        setupPanelKind({ state }),
      ])
    );
    expect(kinds).toEqual({
      hidden: 'none',
      ready: 'none',
      scanning: 'timed',
      softap_qr: 'timed',
      joining: 'hold',
      join_failed: 'untimed',
      connecting: 'timed',
      setup_error: 'untimed',
      updating: 'untimed',
      finalizing: 'hold',
      claim_qr: 'untimed',
      factory_reset: 'untimed',
    });
  });

  it('holds the join code while a phone is on the hotspot', () => {
    expect(setupPanelKind(attached)).toBe('hold');
  });

  it('never times a join code that says why it is back', () => {
    expect(setupPanelKind({ ...joinCode, reason: 'Wrong password.' })).toBe(
      'untimed'
    );
    expect(setupPanelKind({ ...joinCode, reason: '  ' })).toBe('timed');
  });

  it('paints nothing for a state this build does not know', () => {
    expect(setupPanelKind({ state: 'future_state' })).toBe('none');
  });
});

describe('advanceSetupPanelClock', () => {
  it('counts from when the panel first appears', () => {
    const clock = run([[4_000, connecting]]);
    expect(clock.deadline).toBe(4_000 + SETUP_PANEL_WINDOW_MS);
    expect(isSetupPanelCleared(clock, connecting, true, 63_999)).toBe(false);
    expect(isSetupPanelCleared(clock, connecting, true, 64_000)).toBe(true);
  });

  it('gives the first join code of an episode a whole window', () => {
    // The daemon raises the hotspot ~40 s after power-on; the code must not
    // get only the 20 s left of the narration's window.
    const clock = run([
      [2_000, connecting],
      [40_000, joinCode],
    ]);
    expect(clock.deadline).toBe(100_000);
  });

  it('does not extend for re-sent states or later hotspot phases', () => {
    const clock = run([
      [0, joinCode],
      [30_000, joinCode],
      [120_000, connecting],
      [125_000, scanning],
      [130_000, joinCode],
    ]);
    expect(clock.deadline).toBe(60_000);
    expect(isSetupPanelCleared(clock, joinCode, true, 130_000)).toBe(true);
  });

  it('shows the join code that first rises after the boot window', () => {
    // The 5-minute raise: the narration cleared at 60 s, the code still gets
    // its minute, and unplugging and plugging back in repeats this.
    const clock = run([
      [1_000, connecting],
      [300_000, joinCode],
    ]);
    expect(isSetupPanelCleared(clock, joinCode, true, 359_999)).toBe(false);
    expect(isSetupPanelCleared(clock, joinCode, true, 360_000)).toBe(true);
  });

  it('never clears a unit with nothing saved to display', () => {
    const clock = run([[0, joinCode]]);
    expect(isSetupPanelCleared(clock, joinCode, false, 10 * 3_600_000)).toBe(
      false
    );
  });

});

describe('advanceSetupPanelClock holds, exemptions, and episodes', () => {
  it('holds while a phone is attached and gives a fresh window after', () => {
    const held = run([
      [0, joinCode],
      [50_000, attached],
    ]);
    expect(isSetupPanelCleared(held, attached, true, 500_000)).toBe(false);
    const after = run([[200_000, joinCode]], held);
    expect(after.deadline).toBe(260_000);
    expect(isSetupPanelCleared(after, joinCode, true, 259_999)).toBe(false);
    expect(isSetupPanelCleared(after, joinCode, true, 260_000)).toBe(true);
  });

  it('holds during a join and gives a fresh window after it', () => {
    const clock = run([
      [0, joinCode],
      [90_000, joining],
      [150_000, connecting],
    ]);
    expect(clock.deadline).toBe(210_000);
  });

  it('keeps the join code that carries a failed join reason', () => {
    const retry = { ...joinCode, reason: 'Wrong password.' };
    const clock = run([
      [0, joinCode],
      [90_000, joining],
      [150_000, { state: SetupDisplayState.JoinFailed }],
      [150_001, retry],
    ]);
    expect(isSetupPanelCleared(clock, retry, true, 3_600_000)).toBe(false);
  });

  it('never clears pairing, error, update, or reset panels', () => {
    const clock = run([[0, joinCode]]);
    for (const state of [
      SetupDisplayState.ClaimQr,
      SetupDisplayState.SetupError,
      SetupDisplayState.JoinFailed,
      SetupDisplayState.Updating,
      SetupDisplayState.FactoryReset,
    ]) {
      expect(isSetupPanelCleared(clock, { state }, true, 3_600_000)).toBe(
        false
      );
    }
  });

  it('gives a later episode its own window', () => {
    const clock = run([
      [0, joinCode],
      [600_000, hidden, true],
      [3_600_000, connecting],
      [3_900_000, joinCode],
    ]);
    expect(clock.deadline).toBe(3_960_000);
    const narration = run([
      [0, joinCode],
      [600_000, hidden, true],
      [3_600_000, connecting],
    ]);
    expect(narration.deadline).toBe(3_660_000);
  });

  it('keeps the episode across a hidden command while offline', () => {
    const clock = run([
      [0, joinCode],
      [120_000, hidden],
      [125_000, joinCode],
    ]);
    expect(isSetupPanelCleared(clock, joinCode, true, 125_000)).toBe(true);
  });

  it('ignores an online flag while a no-network panel is showing', () => {
    const clock = run([
      [0, joinCode],
      [70_000, joinCode, true],
    ]);
    expect(clock.deadline).toBe(60_000);
  });
});
