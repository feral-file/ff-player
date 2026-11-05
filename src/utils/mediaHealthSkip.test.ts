import { LoopMode } from '@/models/cast_info.model';
import type { DP1Item } from '@/models/dp1.model';
import { describe, expect, it } from 'vitest';
import { hintSkippedIndices, resolveHintedSkip } from './mediaHealthSkip';

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

describe('hintSkippedIndices', () => {
  const skippedUnder = (
    loopMode: LoopMode,
    index: number | undefined,
    ...ids: string[]
  ) => hintSkippedIndices({ items, index, loopMode, isBroken: broken(...ids) });

  it('lists every hinted slot but the one on the wall under repeat-playlist', () => {
    expect(skippedUnder(LoopMode.playlist, 0, 'b', 'd')).toEqual([1, 3]);
    // A hint that arrived on a refresh for the playing work is not a skip yet.
    expect(skippedUnder(LoopMode.playlist, 1, 'b', 'd')).toEqual([3]);
  });

  it('reports nothing when the player would tolerate every slot', () => {
    expect(skippedUnder(LoopMode.playlist, 0, 'a', 'b', 'c', 'd')).toEqual([]);
    expect(skippedUnder(LoopMode.one, 0, 'b')).toEqual([]);
    expect(skippedUnder(LoopMode.playlist, 0)).toEqual([]);
    expect(hintSkippedIndices({ items: [], index: undefined, loopMode: LoopMode.playlist, isBroken: () => true })).toEqual([]);
  });

  it('keeps the hinted tail under repeat-off, since it still plays', () => {
    expect(skippedUnder(LoopMode.none, 0, 'b', 'd')).toEqual([1]);
    expect(skippedUnder(LoopMode.none, 0, 'c', 'd')).toEqual([]);
  });

  it('agrees with the resolver for every slot, map and loop mode', () => {
    const ids = items.map(entry => entry.id);
    for (const loopMode of [LoopMode.playlist, LoopMode.none, LoopMode.one]) {
      for (let mask = 0; mask < 1 << ids.length; mask += 1) {
        const hinted = ids.filter((_, i) => (mask >> i) & 1);
        const isBroken = broken(...hinted);
        for (let current = 0; current < ids.length; current += 1) {
          const expected = ids
            .map((_, index) => index)
            .filter(
              index =>
                index !== current &&
                resolveHintedSkip({ index, items, loopMode, isBroken })
                  .index !== index
            );
          expect(
            hintSkippedIndices({ items, index: current, loopMode, isBroken })
          ).toEqual(expected);
        }
      }
    }
  });
});
