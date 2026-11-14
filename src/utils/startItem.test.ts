import { describe, expect, it } from 'vitest';
import type { DP1Item } from '@/models/dp1.model';
import { startItemIndex } from './startItem';

const item = (id: string, source = `https://art.test/${id}`): DP1Item =>
  ({ id, source, license: {} }) as DP1Item;

const items = [item('a'), item('b'), item('c')];

describe('startItemIndex', () => {
  it('finds the work by id', () => {
    expect(startItemIndex(items, { id: 'c' })).toBe(2);
  });

  it('prefers an id anywhere in the list over an earlier source match', () => {
    const shared = [item('m1', 'https://art.test/series'), item('m2', 'https://art.test/series')];
    expect(
      startItemIndex(shared, { id: 'm2', source: 'https://art.test/series' })
    ).toBe(1);
  });

  it('falls back to the source when no item carries the id', () => {
    expect(
      startItemIndex(items, { id: 'regenerated', source: 'https://art.test/b' })
    ).toBe(1);
  });

  it('finds the work by source alone', () => {
    expect(startItemIndex(items, { source: 'https://art.test/b' })).toBe(1);
  });

  it('takes the first slot when a work repeats', () => {
    expect(startItemIndex([item('a'), item('b'), item('a')], { id: 'a' })).toBe(0);
  });

  it('does not throw on an item that carries no id', () => {
    const idless = { source: 'https://art.test/x', license: {} } as DP1Item;
    expect(startItemIndex([idless, item('b')], { id: 'b' })).toBe(1);
  });

  it('asks for nothing when the work is not in the list', () => {
    expect(
      startItemIndex(items, { id: 'z', source: 'https://art.test/z' })
    ).toBeUndefined();
  });

  it.each([
    undefined,
    null,
    'c',
    2,
    ['c'],
    {},
    { id: 2 },
    { id: '  ' },
    { source: '' },
  ])('asks for nothing for a malformed argument: %j', malformed => {
    expect(startItemIndex(items, malformed)).toBeUndefined();
  });
});
