import { describe, expect, it } from 'vitest';
import { DP1Call, DP1Item, DP1License } from '@/models/dp1.model';
import {
  DEFAULT_CONTENT_POLICY,
  allowsContent,
  filterContent,
  parseContentContext,
  parseContentPolicy,
} from './contentPolicy';

const work = (id: string, rating?: 'general' | 'mature'): DP1Item => ({
  id, source: `https://art.test/${id}`, license: DP1License.Open,
  ...(rating === undefined ? {} : { contentRating: rating }),
});

describe('content viewing policy', () => {
  it('keeps unreviewed curated works playable until explicit archive audit', () => {
    expect(allowsContent(work('unrated'), DEFAULT_CONTENT_POLICY, 'curated')).toBe(true);
    expect(allowsContent(work('mature', 'mature'), DEFAULT_CONTENT_POLICY, 'curated')).toBe(false);
  });

  it('pins all combinations of the approved matrix', () => {
    for (const showMatureContent of [false, true]) {
      for (const strictPersonal of [false, true]) {
        for (const blockUnratedCurated of [false, true]) {
          const policy = { version: 1 as const, showMatureContent, strictPersonal, blockUnratedCurated };
          for (const context of ['curated', 'personal'] as const) {
            for (const rating of [undefined, 'general', 'mature'] as const) {
              const allowed = showMatureContent || (context === 'personal' && !strictPersonal) ||
                rating === 'general' || (rating === undefined && (context === 'personal' || !blockUnratedCurated));
              expect(allowsContent(work('a', rating), policy, context)).toBe(allowed);
            }
          }
        }
      }
    }
  });

  it('rejects malformed labels even when normal playback is selected', () => {
    const policy = { ...DEFAULT_CONTENT_POLICY, showMatureContent: true };
    for (const raw of [null, 'safe', 1]) {
      expect(allowsContent({ ...work('a'), contentRating: raw } as DP1Item, policy, 'curated')).toBe(false);
    }
  });

  it('filters a projection, preserves order and never reuses modified signatures', () => {
    const source = { dpVersion: '1.1.0', title: 'Set', signature: 'signature',
      signatures: [{ sig: 'signed-original' }],
      items: [work('a', 'general'), work('b', 'mature'), work('c')],
    };
    const snapshot = structuredClone(source);
    const result = filterContent(source, DEFAULT_CONTENT_POLICY, 'curated', 2);
    expect(result.playlist?.items?.map(item => item.id)).toEqual(['a', 'c']);
    expect(result.index).toBe(1);
    expect(result.playlist).not.toHaveProperty('signature');
    expect(result.playlist).not.toHaveProperty('signatures');
    expect(source).toEqual(snapshot);
  });

  it('keeps an unchanged document and reports all-filtered explicitly', () => {
    const source: DP1Call = { dpVersion: '1.1.0', title: 'Set', items: [work('a', 'general')] };
    expect(filterContent(source, DEFAULT_CONTENT_POLICY, 'curated').playlist).toBe(source);
    expect(filterContent({ ...source, items: [work('b', 'mature')] },
      DEFAULT_CONTENT_POLICY, 'curated').playlist).toBeNull();
  });

  it('requires an exact complete policy and only known contexts', () => {
    expect(parseContentPolicy(DEFAULT_CONTENT_POLICY)).toEqual(DEFAULT_CONTENT_POLICY);
    for (const input of [null, {}, { ...DEFAULT_CONTENT_POLICY, version: 2 },
      { ...DEFAULT_CONTENT_POLICY, strictPersonal: 'false' }]) {
      expect(() => parseContentPolicy(input)).toThrow();
    }
    expect(parseContentContext(undefined)).toBe('curated');
    expect(parseContentContext('personal')).toBe('personal');
    expect(() => parseContentContext(null)).toThrow();
    expect(() => parseContentContext('unknown')).toThrow();
  });
});
