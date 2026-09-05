/** @vitest-environment jsdom */
/**
 * useShowingKey must change on every showing change a session adjustment
 * must not survive — including ones useCurrentItemIdentity cannot see —
 * and stay stable across a same-slot re-render.
 */
import type { DP1Item } from '@/models/dp1.model';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCurrentItemIdentity, useShowingKey } from './useCurrentItemIdentity';

function work(id: string, source: string): DP1Item {
  return { id, source, license: {} } as DP1Item;
}

describe('useShowingKey', () => {
  it('changes when advancing between adjacent slots that share an id', () => {
    const playlist = [work('same', 'https://a'), work('same', 'https://a')];
    const { result, rerender } = renderHook(
      ({ index }: { index: number }) => ({
        identity: useCurrentItemIdentity(playlist, index),
        key: useShowingKey(playlist, index),
      }),
      { initialProps: { index: 0 } }
    );
    const first = result.current;
    rerender({ index: 1 });
    expect(result.current.identity).toBe(first.identity);
    expect(result.current.key).not.toBe(first.key);
  });

  it('changes when a new cast reuses an id for a different source', () => {
    const { result, rerender } = renderHook(
      ({ playlist }: { playlist: DP1Item[] }) => useShowingKey(playlist, 0),
      { initialProps: { playlist: [work('x', 'https://one')] } }
    );
    const first = result.current;
    rerender({ playlist: [work('x', 'https://two')] });
    expect(result.current).not.toBe(first);
  });

  it('is stable across a same-slot re-render', () => {
    const playlist = [work('x', 'https://one')];
    const { result, rerender } = renderHook(() => useShowingKey(playlist, 0));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
