import { describe, expect, it } from 'vitest';
import { CastCommand } from './cast_info.model';

describe('CastCommand surface', () => {
  it('does not expose deprecated playback control commands', () => {
    // These commands are intentionally removed from the contract. Active senders
    // must use index-based control instead of legacy timeline/playback actions.
    const deprecatedCommands = [
      'pauseCasting',
      'resumeCasting',
      'nextArtwork',
      'previousArtwork',
      'updateDuration',
    ] as const;

    deprecatedCommands.forEach(command => {
      expect(command in CastCommand).toBe(false);
    });
  });
});
