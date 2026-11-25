import { NO_DURATION_VALUE } from '@/constants';
import type { DP1Item } from '@/models/dp1.model';
import { describe, expect, it } from 'vitest';
import { normalizeItemDurations } from './playlistUpdates';

const item = (id: string, duration?: number): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, duration }) as DP1Item;

describe('normalizeItemDurations (DP-1 core §4 duration inheritance)', () => {
  it('keeps an item duration over the playlist default', () => {
    const [a] = normalizeItemDurations([item('a', 7)], { duration: 30 });
    expect(a.duration).toBe(7);
  });

  it('inherits defaults.duration when the item omits its own', () => {
    const [a] = normalizeItemDurations([item('a')], { duration: 30 });
    expect(a.duration).toBe(30);
  });

  it('holds the slot when neither item nor defaults set a duration', () => {
    expect(normalizeItemDurations([item('a')])[0].duration).toBe(
      NO_DURATION_VALUE
    );
    expect(normalizeItemDurations([item('a')], {})[0].duration).toBe(
      NO_DURATION_VALUE
    );
  });
});
