/**
 * Contract for tombstone label resolution (feral-file#3452): a resolved
 * manifest label belongs to exactly one item, and the very first render after
 * an item change must never show the previous item's artist/title — even
 * though the new item's manifest is still pending.
 */
import type { DP1Item } from '@/models/dp1.model';
import type { RefManifestLabel } from '@/utils/playlistDisplayPreference';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTombstoneInfo } from './useTombstoneInfo';

const { loadRefManifestLabelMock } = vi.hoisted(() => ({
  loadRefManifestLabelMock: vi.fn(),
}));

vi.mock('@/utils/playlistDisplayPreference', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/utils/playlistDisplayPreference')
  >()),
  loadRefManifestLabel: loadRefManifestLabelMock,
}));

const itemA: DP1Item = {
  id: 'item-a',
  source: 'https://example.com/a',
  ref: 'https://example.com/a-manifest.json',
  license: 'open',
} as unknown as DP1Item;

const itemB: DP1Item = {
  id: 'item-b',
  title: 'Playlist Title B',
  source: 'https://example.com/b',
  ref: 'https://example.com/b-manifest.json',
  license: 'open',
} as unknown as DP1Item;

afterEach(() => {
  loadRefManifestLabelMock.mockReset();
});

describe('useTombstoneInfo', () => {
  it('never renders the previous item label for a new item with a pending manifest', async () => {
    const labelA: RefManifestLabel = {
      artistNames: 'Artist A',
      title: 'Manifest Title A (2021)',
    };
    let resolveB: (label: RefManifestLabel) => void = () => undefined;
    loadRefManifestLabelMock.mockImplementation((item: DP1Item) => {
      if (item.id === 'item-a') {
        return Promise.resolve(labelA);
      }
      return new Promise<RefManifestLabel>(resolve => {
        resolveB = resolve;
      });
    });

    const { result, rerender } = renderHook(
      ({ item }: { item: DP1Item }) => useTombstoneInfo(item),
      { initialProps: { item: itemA } }
    );
    await waitFor(() => {
      expect(result.current.title).toBe('Manifest Title A (2021)');
    });
    expect(result.current.artistName).toBe('Artist A');

    // Item change with B's manifest still pending: the first render must
    // already be free of A's label — B's own playlist title, no artist.
    rerender({ item: itemB });
    expect(result.current.title).toBe('Playlist Title B');
    expect(result.current.artistName).toBeUndefined();

    resolveB({ artistNames: 'Artist B', title: 'Manifest Title B' });
    await waitFor(() => {
      expect(result.current.artistName).toBe('Artist B');
    });
  });

  it('labels from inline item metadata when the item has no ref', () => {
    loadRefManifestLabelMock.mockResolvedValue(undefined);
    const inlineItem = {
      id: 'inline-1',
      title: 'Sudfah #1',
      source: 'https://example.com/s',
      license: 'open',
      metadata: {
        title: 'Sudfah #1 (2022)',
        artists: [{ name: 'Melissa Wiederrecht', id: '' }],
      },
    } as unknown as DP1Item;

    const { result } = renderHook(() => useTombstoneInfo(inlineItem));
    expect(result.current.title).toBe('Sudfah #1 (2022)');
    expect(result.current.artistName).toBe('Melissa Wiederrecht');
  });

  it('drops a manifest that resolves after the item moved on', async () => {
    let resolveA: (label: RefManifestLabel) => void = () => undefined;
    loadRefManifestLabelMock.mockImplementation((item: DP1Item) => {
      if (item.id === 'item-a') {
        return new Promise<RefManifestLabel>(resolve => {
          resolveA = resolve;
        });
      }
      return new Promise<RefManifestLabel>(() => undefined);
    });

    const { result, rerender } = renderHook(
      ({ item }: { item: DP1Item }) => useTombstoneInfo(item),
      { initialProps: { item: itemA } }
    );
    rerender({ item: itemB });

    resolveA({ artistNames: 'Artist A', title: 'Manifest Title A (2021)' });
    // Give the stale resolution a chance to (incorrectly) land.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.current.title).toBe('Playlist Title B');
    expect(result.current.artistName).toBeUndefined();
  });
});
