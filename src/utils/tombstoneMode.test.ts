/**
 * Wire-contract guard for the tombstone mode (feral-file#3452): ff-app ships
 * independently, so unknown strings must degrade to the product default
 * instead of leaking into the overlay as a truthy non-Off mode.
 */
import { TombstoneMode } from '@/models/display_settings.model';
import { describe, expect, it } from 'vitest';
import { coerceTombstoneMode } from './tombstoneMode';

describe('coerceTombstoneMode', () => {
  it('passes through every known mode', () => {
    for (const mode of Object.values(TombstoneMode)) {
      expect(coerceTombstoneMode(mode)).toBe(mode);
    }
  });

  it('falls back to Timed for unknown or missing values', () => {
    expect(coerceTombstoneMode(undefined)).toBe(TombstoneMode.Timed);
    expect(coerceTombstoneMode('')).toBe(TombstoneMode.Timed);
    expect(coerceTombstoneMode('30s')).toBe(TombstoneMode.Timed);
    expect(coerceTombstoneMode('Timed')).toBe(TombstoneMode.Timed);
  });
});
