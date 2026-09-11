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
