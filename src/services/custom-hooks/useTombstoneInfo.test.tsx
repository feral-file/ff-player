/**
 * Contract for tombstone label resolution (feral-file#3452): a resolved
 * manifest label belongs to exactly one item, and the very first render after
 * an item change must never show the previous item's artist/title — even
 * though the new item's manifest is still pending.
 */
import type { DP1Item } from '@/models/dp1.model';
import { DP1License } from '@/models/dp1.model';
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

/**
 * A Ref Manifest can reach the item by two carriages. `inlineManifest`
 * (playlists extension §3.6) is already in hand, so it labels the item with no
 * effect and no fetch; a manifest fetched from `ref` is authoritative and
 * replaces it when it lands.
 */
/**
 * An item carrying a §3.6 inline manifest, plus the legacy non-standard
 * `metadata` block it is meant to outrank.
 *
 * Built with NO `as` cast, unlike the ref fixtures above, and that is
 * load-bearing rather than tidiness. The manifest is a realistic producer
 * document — a title, one artist with only a name, a thumbnail with only a
 * uri, and no creditLine/description/tags/safety — every one of which the
 * ref-manifest schema allows to be absent. So it compiles only while
 * RefManifest still agrees with that schema, which makes this fixture the
 * standing guard against the type drifting back to over-required (verified:
 * restoring `sha256` to required breaks exactly this literal).
 */
const inlineManifestItem: DP1Item = {
  id: 'inline-manifest-1',
  title: 'Playlist Title',
  source: 'https://example.com/s',
  license: DP1License.Open,
  inlineManifest: {
    refVersion: '1.1.0',
    id: 'manifest-1',
    created: '2026-01-01T00:00:00Z',
    locale: 'en',
    metadata: {
      title: 'Sudfah #1 (2022)',
      artists: [{ name: 'Melissa Wiederrecht' }],
      thumbnails: { default: { uri: 'https://example.com/t.png' } },
    },
  },
  metadata: {
    title: 'Legacy Title',
    artists: [{ name: 'Legacy Artist', id: '' }],
  },
};

describe('useTombstoneInfo with an inline manifest', () => {
  it('labels with no fetch, outranking the legacy inline metadata block', () => {
    const { result } = renderHook(() => useTombstoneInfo(inlineManifestItem));
    expect(result.current.title).toBe('Sudfah #1 (2022)');
    expect(result.current.artistName).toBe('Melissa Wiederrecht');
    expect(loadRefManifestLabelMock).not.toHaveBeenCalled();
  });

  it('is outranked by a manifest fetched from ref', async () => {
    loadRefManifestLabelMock.mockResolvedValue({
      artistNames: 'Ref Artist',
      title: 'Ref Title',
    });
    const bothItem = {
      id: 'both-1',
      title: 'Playlist Title',
      source: 'https://example.com/s',
      ref: 'https://example.com/manifest.json',
      license: 'open',
      inlineManifest: {
        refVersion: '1.1.0',
        id: 'manifest-1',
        created: '2026-01-01T00:00:00Z',
        metadata: {
          title: 'Inline Title',
          artists: [{ name: 'Inline Artist', id: '' }],
        },
      },
    } as unknown as DP1Item;

    const { result } = renderHook(() => useTombstoneInfo(bothItem));
    // Before the fetch resolves the inline copy already labels the item, so
    // the tombstone is never blank waiting on the network...
    expect(result.current.title).toBe('Inline Title');
    expect(result.current.artistName).toBe('Inline Artist');
    // ...and the authoritative document replaces it once it lands.
    await waitFor(() => {
      expect(result.current.title).toBe('Ref Title');
    });
    expect(result.current.artistName).toBe('Ref Artist');
  });
  it('does not mix the two carriages: a partial ref manifest wins whole', async () => {
    // A fetched manifest with a title but no artists must not print its title
    // above the inline manifest's artist line — the two lines describe one
    // work, so the document wins outright rather than field by field.
    loadRefManifestLabelMock.mockResolvedValue({ title: 'Ref Title Only' });
    const bothItem = {
      id: 'partial-ref-1',
      title: 'Playlist Title',
      source: 'https://example.com/s',
      ref: 'https://example.com/manifest.json',
      license: 'open',
      inlineManifest: {
        refVersion: '1.1.0',
        id: 'manifest-1',
        created: '2026-01-01T00:00:00Z',
        metadata: {
          title: 'Inline Title',
          artists: [{ name: 'Inline Artist', id: '' }],
        },
      },
    } as unknown as DP1Item;

    const { result } = renderHook(() => useTombstoneInfo(bothItem));
    await waitFor(() => {
      expect(result.current.title).toBe('Ref Title Only');
    });
    expect(result.current.artistName).toBeUndefined();
  });
});
