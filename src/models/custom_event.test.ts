import { describe, expect, it } from 'vitest';
import contract from '../../public/ffos-player-contract.json';
import { PlayerToastNotice, SetupDisplayState } from './custom_event';

/*
 * The manifest's setupDisplay.states array is no longer descriptive-only:
 * feral-controld reads it as a capability gate (its ShowConnecting downgrades
 * to join_failed when "connecting" is absent), so an enum member missing from
 * the JSON silently downgrades that state on-device forever, with no type
 * error anywhere. This test is the only thing pinning the two together.
 */
describe('ffos-player-contract.json setupDisplay manifest', () => {
  it('lists every SetupDisplayState', () => {
    const states = contract.contracts.setupDisplay.states;
    for (const state of Object.values(SetupDisplayState)) {
      expect(states, `manifest missing state "${state}"`).toContain(state);
    }
  });

  it('declares the optional reason field for every prose-carrying state', () => {
    const fields = contract.contracts.setupDisplay.stateFields;
    expect(fields.join_failed.optional).toContain('reason');
    expect(fields.connecting.optional).toContain('reason');
    expect(fields.setup_error.optional).toContain('reason');
  });

  it('declares the direct portal fallback carried by softap_qr', () => {
    const fields = contract.contracts.setupDisplay.stateFields;
    expect(fields.softap_qr.optional).toContain('portal_url');
  });

  it('declares the failure line carried by the re-raised softap_qr', () => {
    const fields = contract.contracts.setupDisplay.stateFields;
    expect(fields.softap_qr.optional).toContain('reason');
  });

  it('declares the attached-phase flag carried by softap_qr', () => {
    // Capability gate: dropping this from the manifest would make controld
    // treat the build as pre-swap and never send the attach repaint, with
    // every test still green.
    const fields = contract.contracts.setupDisplay.stateFields;
    expect(fields.softap_qr.optional).toContain('client_attached');
  });
});

/*
 * Same fuse for playerToast: feral-controld sends only notices the manifest
 * lists, and the handler accepts only notices the enum lists. The two sets
 * must be identical or a notice is either never sent or always rejected.
 */
describe('ffos-player-contract.json playerToast manifest', () => {
  it('lists exactly the PlayerToastNotice values, version 1', () => {
    const entry = contract.contracts.playerToast;
    expect(entry.version).toBe(1);
    expect(entry.requestKey).toBe('request');
    expect([...entry.states].sort()).toEqual(
      Object.values(PlayerToastNotice).sort()
    );
    expect(entry.acceptedResponse).toEqual({ ok: true });
  });
});
