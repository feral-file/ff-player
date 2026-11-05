import { LoopMode } from '@/models/cast_info.model';
import type { DP1Item } from '@/models/dp1.model';
import { describe, expect, it } from 'vitest';
import { resolveHintedSkip } from './mediaHealthSkip';

const item = (id: string): DP1Item =>
  ({ id, source: `https://a.test/${id}`, license: {} }) as DP1Item;
const items = ['a', 'b', 'c', 'd'].map(item);
const broken = (...ids: string[]) => (source: string) =>
  ids.some(id => source.endsWith(`/${id}`));

describe('resolveHintedSkip', () => {
  it('leaves an unhinted slot alone', () => {
    expect(
      resolveHintedSkip({
        index: 1,
        items,
        loopMode: LoopMode.playlist,
        isBroken: broken('a'),
      })
    ).toEqual({ index: 1, skipped: [] });
  });

  it('walks forward past consecutive hinted slots and reports each one', () => {
    expect(
      resolveHintedSkip({
        index: 1,
        items,
        loopMode: LoopMode.playlist,
        isBroken: broken('b', 'c'),
      })
    ).toEqual({ index: 3, skipped: [items[1], items[2]] });
  });

  it('wraps under repeat-playlist', () => {
    expect(
      resolveHintedSkip({
        index: 3,
        items,
        loopMode: LoopMode.playlist,
        isBroken: broken('d', 'a'),
      })
    ).toEqual({ index: 1, skipped: [items[3], items[0]] });
  });

  it('does not wrap under repeat-off: a hinted tail plays and the budget judges it', () => {
    expect(
      resolveHintedSkip({
        index: 2,
        items,
        loopMode: LoopMode.none,
        isBroken: broken('c', 'd'),
      })
    ).toEqual({ index: 2, skipped: [] });
  });

  it('ignores hints under repeat-one', () => {
    expect(
      resolveHintedSkip({
        index: 0,
        items,
        loopMode: LoopMode.one,
        isBroken: broken('a'),
      })
    ).toEqual({ index: 0, skipped: [] });
  });

  it('tolerates an all-broken map by playing the requested slot', () => {
    expect(
      resolveHintedSkip({
        index: 2,
        items,
        loopMode: LoopMode.playlist,
        isBroken: () => true,
      })
    ).toEqual({ index: 2, skipped: [] });
  });

  it('normalises an out-of-range index before judging it', () => {
    expect(
      resolveHintedSkip({
        index: 5,
        items,
        loopMode: LoopMode.playlist,
        isBroken: broken('b'),
      })
    ).toEqual({ index: 2, skipped: [items[1]] });
  });
});
