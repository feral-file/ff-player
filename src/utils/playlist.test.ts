import { afterEach, describe, expect, it, vi } from 'vitest';
import { DP1License, type DP1Item } from '@/models/dp1.model';
import { calculateStartTime, getIndex } from './playlist';

/**
 * Builds the smallest DP1 item shape needed for playlist timing tests so the
 * assertions stay focused on scheduling behavior.
 */
function createItem(id: string, duration: number): DP1Item {
  return {
    id,
    source: `https://example.com/${id}.jpg`,
    duration,
    license: DP1License.Open,
  };
}

describe('playlist timing helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('getIndex wraps elapsed time across total playlist duration', () => {
    const playlistItems = [
      createItem('artwork-1', 10),
      createItem('artwork-2', 20),
      createItem('artwork-3', 30),
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:25.000Z'));

    expect(getIndex(playlistItems, Date.parse('2025-01-01T00:00:00.000Z'))).toBe(
      1
    );
    expect(
      getIndex(playlistItems, Date.parse('2024-12-31T23:59:10.000Z'))
    ).toBe(1);
  });

  it('calculateStartTime subtracts prior durations and elapsed item time', () => {
    const playlistItems = [
      createItem('artwork-1', 5),
      createItem('artwork-2', 8),
      createItem('artwork-3', 13),
    ];

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:34:56.789Z'));

    const expectedBaseTime = new Date('2025-01-01T12:34:56.789Z').setMilliseconds(
      0
    );

    expect(calculateStartTime(playlistItems, 2, 1500)).toBe(
      expectedBaseTime - 5000 - 8000 - 1500
    );
  });
});
