import { NO_DURATION_VALUE } from '@/constants';
import type { DP1Item } from '@/models/dp1.model';
import { resolveItemDuration } from '@/utils/playlist';
import { describe, expect, it } from 'vitest';
import { isUnchangedRefresh } from './playlistUpdates';
import { dp1Document, fixtureId } from '@/testing/dp1Fixtures';

const item = (id: string, extra: Partial<DP1Item> = {}): DP1Item => ({
  id: fixtureId(id),
  source: `https://example.com/${id}.jpg`,
  ...extra,
});

describe('resolveItemDuration (DP-1 core §3 inheritance)', () => {
  it('prefers the item, then override, then defaults', () => {
    const defaults = { duration: 30 };
    const override = { duration: 12 };

    expect(
      resolveItemDuration(item('a', { duration: 7, override }), defaults)
    ).toBe(7);
    expect(resolveItemDuration(item('a', { override }), defaults)).toBe(12);
    expect(resolveItemDuration(item('a'), defaults)).toBe(30);
  });

  it('holds the slot when nothing sets a duration', () => {
    expect(resolveItemDuration(item('a'))).toBe(NO_DURATION_VALUE);
    expect(resolveItemDuration(item('a'), {})).toBe(NO_DURATION_VALUE);
  });
});

describe('isUnchangedRefresh', () => {
  const document = dp1Document({
    items: [item('a')],
    defaults: { duration: 30 },
  });

  it('ignores durations an older build wrote into the held items', () => {
    const held = { ...document, items: [item('a', { duration: 30 })] };

    expect(isUnchangedRefresh(held, document)).toBe(true);
  });

  it('sees a change of defaults alone', () => {
    expect(
      isUnchangedRefresh(document, {
        ...document,
        defaults: { duration: 7 },
      })
    ).toBe(false);
  });
});
