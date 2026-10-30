/** @vitest-environment jsdom */
/**
 * useShowingKey must change on every showing change a session adjustment
 * must not survive — including ones useCurrentItemIdentity cannot see —
 * and stay stable across a same-slot re-render.
 */
import { defaultDP1DisplayPreference, type DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { useArtworkSettings } from '@/services/custom-hooks/useArtworkSettings';
import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
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

  it('renews the UUID and rejects stale writes for delimiter-colliding works', () => {
    const owner = {};
    const first = work('a|data:text/plain,one', 'data:text/plain,two');
    const second = work('a', 'data:text/plain,one|data:text/plain,two');
    const { result, rerender, unmount } = renderHook(
      ({ item }: { item: DP1Item }) => {
        const showingKey = useShowingKey([item], 0);
        const { displaySettings } = useArtworkSettings(
          defaultDP1DisplayPreference,
          showingKey
        );
        useLayoutEffect(() => canvasService.registerDisplaySettingsReporter(
          () => ({ showingKey, settings: displaySettings }), owner
        ), [showingKey, displaySettings]);
        return displaySettings;
      },
      { initialProps: { item: first } }
    );
    const showingKey = canvasService.getStatus().deviceSettings?.showingKey;
    act(() => {
      expect(canvasService.updateDisplaySettings({
        isSaved: false, showingKey, margin: '10%',
      }).ok).toBe(true);
    });
    expect(result.current?.margin).toBe('10%');
    rerender({ item: second });
    expect(canvasService.getStatus().deviceSettings?.showingKey).not.toBe(showingKey);
    expect(result.current?.margin).toBe(defaultDP1DisplayPreference.margin);
    expect(canvasService.updateDisplaySettings({
      isSaved: false, showingKey, margin: '20%',
    }).ok).toBe(false);
    unmount();
  });
});

describe('useShowingKey — position is not part of an unambiguous showing', () => {
  it('is stable when an unambiguous work moves position in a rebuilt list', () => {
    // A series group expanding earlier in the playlist shifts every later
    // slot. The work on screen is the same showing — `slotShowingUnchanged`
    // says so — and an ended artwork held by repeat-off is remounted and
    // replayed if the key moves with the index (feralfile-bot F7 on #320).
    const before = [work('group-0', 'https://g0'), work('tail', 'https://t')];
    const after = [
      work('group-0', 'https://g0'),
      work('group-1', 'https://g1'),
      work('tail', 'https://t'),
    ];
    const { result, rerender } = renderHook(
      ({ playlist, index }: { playlist: DP1Item[]; index: number }) =>
        useShowingKey(playlist, index),
      { initialProps: { playlist: before, index: 1 } }
    );
    const first = result.current;
    rerender({ playlist: after, index: 2 });
    expect(result.current).toBe(first);
  });

  it('is stable when a work sharing an id under a different source moves', () => {
    // The same id twice is legitimate, and `[identity, source]` already tells
    // the two apart — so the index is not needed and must not be added, or the
    // rebuild would remount a showing whose deadline it had just preserved and
    // cut it off with the remainder of the interval.
    const before = [
      work('dup', 'https://first'),
      work('dup', 'https://second'),
    ];
    const after = [
      work('dup', 'https://first'),
      work('inserted', 'https://ins'),
      work('dup', 'https://second'),
    ];
    const { result, rerender } = renderHook(
      ({ playlist, index }: { playlist: DP1Item[]; index: number }) =>
        useShowingKey(playlist, index),
      { initialProps: { playlist: before, index: 1 } }
    );
    const first = result.current;
    rerender({ playlist: after, index: 2 });
    expect(result.current).toBe(first);
  });
});

describe('useShowingKey — a repeated artwork keeps its own occurrence', () => {
  it('is stable when a slot sharing id AND source is moved by a rebuild', () => {
    // Identity and source cannot separate these two slots, so something
    // positional has to — and the slot index was the wrong thing, because a
    // series expanding ahead of the tail moves it without making it a new
    // showing. The occurrence of the pair does not move with the list
    // (feralfile-bot F7 on #320, second pass).
    const before = [
      work('dup', 'https://same'),
      work('separator', 'https://s'),
      work('dup', 'https://same'),
    ];
    const after = [
      work('dup', 'https://same'),
      work('expanded', 'https://e'),
      work('separator', 'https://s'),
      work('dup', 'https://same'),
    ];
    const { result, rerender } = renderHook(
      ({ playlist, index }: { playlist: DP1Item[]; index: number }) =>
        useShowingKey(playlist, index),
      { initialProps: { playlist: before, index: 2 } }
    );
    const first = result.current;
    rerender({ playlist: after, index: 3 });
    expect(result.current).toBe(first);
  });

  it('still separates the two occurrences of that same artwork', () => {
    const playlist = [
      work('dup', 'https://same'),
      work('separator', 'https://s'),
      work('dup', 'https://same'),
    ];
    const { result, rerender } = renderHook(
      ({ index }: { index: number }) => useShowingKey(playlist, index),
      { initialProps: { index: 0 } }
    );
    const first = result.current;
    rerender({ index: 2 });
    expect(result.current).not.toBe(first);
  });
});
