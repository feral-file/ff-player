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
      scanning: 'silent',
      softap_qr: 'timed',
      joining: 'hold',
      join_failed: 'silent',
      connecting: 'silent',
      setup_error: 'silent',
      updating: 'untimed',
      finalizing: 'silent',
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

  it('treats a state this build does not know as no setup flow', () => {
    expect(setupPanelKind({ state: 'future_state' })).toBe('none');
  });
});

describe('advanceSetupPanelClock', () => {
  it('counts from the first join code, on both daemon paths', () => {
    // Hotspot at ~40 s (relocation) and at 5 minutes (sustained offline).
    for (const raisedAt of [40_000, 300_000]) {
      const clock = run([
        [2_000, connecting],
        [raisedAt, joinCode],
      ]);
      const end = raisedAt + SETUP_PANEL_WINDOW_MS;
      expect(isSetupPanelCleared(clock, joinCode, true, end - 1)).toBe(false);
      expect(isSetupPanelCleared(clock, joinCode, true, end)).toBe(true);
    }
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

  it('never clears a unit with nothing saved to display', () => {
    const clock = run([[0, joinCode]]);
    expect(isSetupPanelCleared(clock, joinCode, false, 10 * 3_600_000)).toBe(
      false
    );
  });

  it('holds while a phone is attached and gives a fresh window after', () => {
    const held = run([
      [0, joinCode],
      [50_000, attached],
    ]);
    expect(isSetupPanelCleared(held, attached, true, 500_000)).toBe(false);
    const after = run([[200_000, joinCode]], held);
    expect(after.deadline).toBe(260_000);
  });

  it('holds during a join and gives the next join code a fresh window', () => {
    const clock = run([
      [0, joinCode],
      [90_000, joining],
      [150_000, { state: SetupDisplayState.JoinFailed }],
      [150_001, { ...joinCode, reason: 'Wrong password.' }],
      [400_000, joinCode],
    ]);
    expect(isSetupPanelCleared(clock, joining, true, 3_600_000)).toBe(false);
    expect(clock.deadline).toBe(460_000);
  });

});

describe('advanceSetupPanelClock exemptions and episodes', () => {
  it('never clears a join code with a reason, pairing, update, or reset', () => {
    const clock = run([[0, joinCode]]);
    const kept: SetupDisplayDetail[] = [
      { ...joinCode, reason: 'Wrong password.' },
      { state: SetupDisplayState.ClaimQr },
      { state: SetupDisplayState.Updating },
      { state: SetupDisplayState.FactoryReset },
    ];
    for (const display of kept) {
      expect(isSetupPanelCleared(clock, display, true, 3_600_000)).toBe(false);
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
  });

  it('keeps the episode across hidden and narration states while offline', () => {
    const clock = run([
      [0, joinCode],
      [120_000, hidden],
      [125_000, joinCode],
    ]);
    expect(isSetupPanelCleared(clock, joinCode, true, 125_000)).toBe(true);
    // A stale online flag during narration does not end the episode either.
    const stale = run([
      [0, joinCode],
      [70_000, joinCode, true],
      [120_000, connecting, true],
      [125_000, joinCode, true],
    ]);
    expect(stale.deadline).toBe(60_000);
  });
});
