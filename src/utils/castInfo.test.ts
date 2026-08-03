import type { CastInfo } from '@/models';
import { RenderStatus } from '@/models';
import { describe, expect, it } from 'vitest';
import {
  stripEphemeralCastInfoFields,
  stripLegacyCastPlaybackTimeline,
} from './castInfo';

describe('stripLegacyCastPlaybackTimeline', () => {
  it('drops legacy playback timeline fields', () => {
    const castInfo = {
      castCommand: 'displayPlaylist',
      index: 2,
      startTime: 100,
      elapsedTime: 20,
      remainTime: 30,
    } as CastInfo & {
      startTime: number;
      elapsedTime: number;
      remainTime: number;
    };

    expect(stripLegacyCastPlaybackTimeline(castInfo)).toEqual({
      castCommand: 'displayPlaylist',
      index: 2,
    });
  });

  it('returns a new object', () => {
    const castInfo = {
      castCommand: 'updateIndex',
      index: 1,
    } as CastInfo;

    expect(stripLegacyCastPlaybackTimeline(castInfo)).not.toBe(castInfo);
  });
});

describe('stripEphemeralCastInfoFields', () => {
  it('drops renderStatus and legacy timeline fields', () => {
    const castInfo = {
      castCommand: 'displayPlaylist',
      index: 1,
      renderStatus: RenderStatus.ready,
      startTime: 10,
    } as CastInfo & { startTime: number };

    expect(stripEphemeralCastInfoFields(castInfo)).toEqual({
      castCommand: 'displayPlaylist',
      index: 1,
    });
  });
});
