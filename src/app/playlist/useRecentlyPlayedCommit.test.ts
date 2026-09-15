/** @vitest-environment jsdom */
import type { DP1Item } from '@/models/dp1.model';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRecentlyPlayedCommit } from './useRecentlyPlayedCommit';

const {recordRecentlyPlayed} = vi.hoisted(() => ({recordRecentlyPlayed: vi.fn()}));

vi.mock('@/services/CanvasService', () => ({
  canvasService: { recordRecentlyPlayed },
}));

function work(id: string): DP1Item {
  return {id, source: `https://example.test/${id}`, license: {}} as DP1Item;
}

describe('useRecentlyPlayedCommit', () => {
  it('records each visual commit, including automatic repeat advances, not selection', () => {
    const playlist = [work('first'), work('second')];
    const {result} = renderHook(() => useRecentlyPlayedCommit(playlist, null, 'curated'));

    result.current('second');
    result.current('second');

    expect(recordRecentlyPlayed).toHaveBeenNthCalledWith(1, playlist[1], null, 'curated');
    expect(recordRecentlyPlayed).toHaveBeenNthCalledWith(2, playlist[1], null, 'curated');
  });

  it('does not record a stale/non-visible identity', () => {
    const playlist = [work('visible')];
    const {result} = renderHook(() => useRecentlyPlayedCommit(playlist, null, 'curated'));

    result.current('not-visible');

    expect(recordRecentlyPlayed).not.toHaveBeenCalled();
  });
});
