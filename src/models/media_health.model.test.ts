import { describe, expect, it } from 'vitest';
import contract from '../../public/ffos-player-contract.json';
import {
  PLAYBACK_OUTCOME_KINDS,
  PLAYBACK_OUTCOME_RING_SIZE,
  PLAYBACK_OUTCOME_STAGES,
} from './media_health.model';

/*
 * feral-controld reads `contracts.mediaHealth` as the capability gate for the
 * paired rollout: no entry means it never sends hints and falls back to poll
 * inference for play failures. The token lists are what its categoriser is
 * written against, so the manifest and the model must not drift apart.
 */
describe('ffos-player-contract.json mediaHealth manifest', () => {
  const entry = contract.contracts.mediaHealth;

  it('declares the request and status fields the player reads and writes', () => {
    expect(entry.version).toBe(1);
    expect(entry.requestFields).toEqual(['mediaHealth']);
    expect(entry.commands).toEqual(['setMediaHealth']);
    expect(entry.statusFields).toEqual(['outcomes', 'skippedIndices']);
  });

  it('pins every outcome kind and stage the player can emit', () => {
    expect([...entry.outcomeKinds].sort()).toEqual(
      [...PLAYBACK_OUTCOME_KINDS].sort()
    );
    expect([...entry.outcomeStages].sort()).toEqual(
      [...PLAYBACK_OUTCOME_STAGES].sort()
    );
    expect(entry.ringSize).toBe(PLAYBACK_OUTCOME_RING_SIZE);
  });
});
