/* eslint-disable max-lines-per-function -- compact history boundary fixtures */
import { describe, expect, it } from 'vitest';
import { DP1License, Scaling } from '@/models/dp1.model';
import {
  appendRecentlyPlayed,
  parseRecentlyPlayed,
  recentlyPlayedMetadata,
  recentlyPlayedReplay,
  type RecentlyPlayedRecord,
  recentlyPlayedItem,
  RECENTLY_PLAYED_MAX_RECORDS,
} from './recentPlaybackHistory';

const item = (id: string) => ({
  id,
  source: `https://example.test/${id}`,
  license: DP1License.Open,
});

describe('recent playback history', () => {
  it('orders committed works newest first and returns immutable replay data', () => {
    const first = appendRecentlyPlayed([], item('a'), {nowMs: 1, nextSequence: 1});
    if (first === null) {
      throw new Error('first history record was rejected');
    }
    const second = appendRecentlyPlayed(first, item('b'), {nowMs: 2, nextSequence: 2});
    if (second === null) {
      throw new Error('second history record was rejected');
    }
    expect(second.map(record => record.recordId)).toEqual(['rp-2', 'rp-1']);
    const replay = recentlyPlayedItem(second, 'rp-1');
    if (replay === null) {
      throw new Error('retained record was not found');
    }
    replay.source = 'changed';
    const retained = recentlyPlayedItem(second, 'rp-1');
    expect(retained?.source).toContain('a');
  });

  it('bounds retained records and rejects an oversized record explicitly', () => {
    let records: RecentlyPlayedRecord[] = [];
    for (let index = 0; index <= RECENTLY_PLAYED_MAX_RECORDS; index += 1) {
      const next = appendRecentlyPlayed(records, item(String(index)), {
        nowMs: index,
        nextSequence: index,
      });
      if (next === null) {
        throw new Error('small record was rejected');
      }
      records = next;
    }
    expect(records).toHaveLength(RECENTLY_PLAYED_MAX_RECORDS);
    expect(
      appendRecentlyPlayed(
        [],
        {
          id: 'large',
          source: `data:,${'x'.repeat(70000)}`,
          license: DP1License.Open,
        },
        {nowMs: 1, nextSequence: 1}
      )
    ).toBeNull();
  });

  it('exposes presentation metadata without a replayable source', () => {
    const records = appendRecentlyPlayed([], {
      id: 'wall-work',
      source: 'https://private.example/castable-source',
      license: DP1License.Open,
      inlineManifest: {
        refVersion: '1.0',
        id: 'manifest',
        created: '2026-09-07T00:00:00Z',
        locale: 'en',
        metadata: {
          title: 'Wall work',
          artists: [{name: 'Artist'}],
          thumbnails: {small: {uri: 'https://images.example/thumb.jpg'}},
        },
      },
    }, {nowMs: 200, nextSequence: 1});
    if (records === null) {
      throw new Error('metadata record was rejected');
    }

    expect(recentlyPlayedMetadata(records, null)).toEqual([{
      recordId: 'rp-1',
      playedAtMs: 200,
      isActive: false,
      itemId: 'wall-work',
      title: 'Wall work',
      artist: 'Artist',
      thumbnailUrl: 'https://images.example/thumb.jpg',
    }]);
  });

  it('retains applicable artist defaults only for device-internal replay', () => {
    const records = appendRecentlyPlayed(
      [],
      item('defaults'),
      {
        nowMs: 1,
        nextSequence: 1,
        defaults: {duration: 30, license: DP1License.Open, display: {scaling: Scaling.Fit}},
      }
    );
    if (records === null) {throw new Error('defaults record was rejected');}

    expect(recentlyPlayedMetadata(records, null)[0]).not.toHaveProperty('defaults');
    expect(recentlyPlayedReplay(records, 'rp-1')?.defaults).toEqual({
      duration: 30,
      license: DP1License.Open,
      display: {scaling: Scaling.Fit},
    });
  });

  it('marks only one active occurrence, retaining previous repeats', () => {
    const first = appendRecentlyPlayed([], item('same'), {nowMs: 1, nextSequence: 1});
    if (first === null) {throw new Error('first record was rejected');}
    const records = appendRecentlyPlayed(first, item('same'), {nowMs: 2, nextSequence: 2});
    if (records === null) {throw new Error('repeat record was rejected');}

    expect(recentlyPlayedMetadata(records, 'rp-2').map(record => record.isActive)).toEqual([true, false]);
  });

  it('rejects corrupt retained JSON instead of presenting a false empty history', () => {
    expect(() => parseRecentlyPlayed('{"not":"a history"}')).toThrow(
      'Invalid recently played history'
    );
    expect(() => parseRecentlyPlayed(JSON.stringify([{
      recordId: 'rp-bad',
      playedAtMs: 1,
      item: {id: 'bad'},
    }]))).toThrow('Invalid recently played history');
  });
});
