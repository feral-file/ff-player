/**
 * Wire-contract guard for a `seriesRegistry` item (core 1.1.0 §6). The
 * publisher states a playback intent this player does not define, and the
 * viewer's device setting overrides it, so the two have to resolve to one of
 * exactly two things FF1 can do: play the series, or play its representative.
 */
import {
  DP1Chain,
  DP1Item,
  DP1License,
  DP1ProvenanceType,
  DP1SeriesPlayback,
} from '@/models/dp1.model';
import { describe, expect, it } from 'vitest';
import {
  coerceSeriesPlayback,
  isSeriesItem,
  narrowSeriesPlaylist,
  resolveSeriesPlayback,
  seriesItemsForPlayback,
} from './seriesPlayback';

// A Feral File V1–V3 series: a 256-bit id carried as decimal digits, and no
// contract address, because its editions sit under more than one.
const SERIES_ID =
  '111189432907883705479781860609730558140985427661919345637476715406273466581241';

/** A `seriesRegistry` item: core 1.1.0 §6's whole-series form. */
function seriesItem(over: Partial<DP1Item> = {}): DP1Item {
  return {
    id: 'item-series',
    slug: 'scrampled-auw',
    title: 'Scrampled',
    source: 'https://cdn.artworks.feralfile.io/previews/scrampled/0.mp4',
    license: DP1License.Open,
    provenance: {
      type: DP1ProvenanceType.SeriesRegistry,
      contract: { chain: DP1Chain.EVM, seriesId: SERIES_ID },
    },
    ...over,
  };
}

/** One on-chain edition of `seriesItem()`'s series. */
function edition(n: number): DP1Item {
  return {
    id: `edition-${String(n)}`,
    source: `https://cdn.artworks.feralfile.io/previews/scrampled/${String(n)}.mp4`,
    license: DP1License.Open,
    provenance: {
      type: DP1ProvenanceType.OnChain,
      contract: {
        chain: DP1Chain.EVM,
        address: '0x28b51BA8B990c48CB22cB6EF0ad5415fdBA5210C',
        seriesId: SERIES_ID,
        tokenId: String(n),
      },
    },
  };
}

describe('a series item is one the model can hold', () => {
  it('needs no address and no tokenId, and keeps a 256-bit seriesId', () => {
    const item = seriesItem();
    expect(isSeriesItem(item)).toBe(true);
    expect(item.provenance?.contract?.address).toBeUndefined();
    expect(item.provenance?.contract?.tokenId).toBeUndefined();
    expect(item.provenance?.contract?.seriesId).toBe(SERIES_ID);
  });

  it('an edition item is not a series item', () => {
    expect(isSeriesItem(edition(0))).toBe(false);
  });
});

describe('coerceSeriesPlayback', () => {
  it('passes through every known mode', () => {
    for (const mode of Object.values(DP1SeriesPlayback)) {
      expect(coerceSeriesPlayback(mode)).toBe(mode);
    }
  });

  it('falls back to First for unknown or missing values', () => {
    expect(coerceSeriesPlayback(undefined)).toBe(DP1SeriesPlayback.First);
    expect(coerceSeriesPlayback(null)).toBe(DP1SeriesPlayback.First);
    expect(coerceSeriesPlayback('')).toBe(DP1SeriesPlayback.First);
    expect(coerceSeriesPlayback('Full')).toBe(DP1SeriesPlayback.First);
    expect(coerceSeriesPlayback('every')).toBe(DP1SeriesPlayback.First);
  });
});

describe('resolveSeriesPlayback', () => {
  it('takes the item when the device sets no override', () => {
    expect(
      resolveSeriesPlayback({
        item: seriesItem({ seriesPlayback: DP1SeriesPlayback.Full }),
      })
    ).toBe(DP1SeriesPlayback.Full);
    expect(resolveSeriesPlayback({ item: seriesItem() })).toBe(
      DP1SeriesPlayback.First
    );
  });

  it('the device override beats the item, both directions', () => {
    expect(
      resolveSeriesPlayback({
        item: seriesItem({ seriesPlayback: DP1SeriesPlayback.First }),
        deviceOverride: DP1SeriesPlayback.Full,
      })
    ).toBe(DP1SeriesPlayback.Full);
    expect(
      resolveSeriesPlayback({
        item: seriesItem({ seriesPlayback: DP1SeriesPlayback.Full }),
        deviceOverride: DP1SeriesPlayback.First,
      })
    ).toBe(DP1SeriesPlayback.First);
  });

  it('null is "auto", not First: the item still decides', () => {
    expect(
      resolveSeriesPlayback({
        item: seriesItem({ seriesPlayback: DP1SeriesPlayback.Full }),
        deviceOverride: null,
      })
    ).toBe(DP1SeriesPlayback.Full);
  });

  it('random is First: FF1 does not re-roll an edition per loop', () => {
    expect(
      resolveSeriesPlayback({
        item: seriesItem({ seriesPlayback: DP1SeriesPlayback.Random }),
      })
    ).toBe(DP1SeriesPlayback.First);
    expect(
      resolveSeriesPlayback({
        item: seriesItem(),
        deviceOverride: DP1SeriesPlayback.Random,
      })
    ).toBe(DP1SeriesPlayback.First);
  });

  it('an item that is not a series plays as itself whatever is asked', () => {
    expect(
      resolveSeriesPlayback({
        item: edition(0),
        deviceOverride: DP1SeriesPlayback.Full,
      })
    ).toBe(DP1SeriesPlayback.First);
  });
});

describe('seriesItemsForPlayback', () => {
  const item = seriesItem();
  const editions = [edition(0), edition(1), edition(2)];

  it('Full plays the editions the catalog returned', () => {
    expect(
      seriesItemsForPlayback({
        item,
        editions,
        mode: DP1SeriesPlayback.Full,
      })
    ).toEqual(editions);
  });

  it('First plays the item itself — its source is the representative', () => {
    expect(
      seriesItemsForPlayback({ item, editions, mode: DP1SeriesPlayback.First })
    ).toEqual([item]);
  });

  it('Full with no editions resolved still plays something', () => {
    // The index was unreachable, or the series has no edition it returns.
    // A blank screen is the one outcome a player must not produce.
    expect(
      seriesItemsForPlayback({ item, mode: DP1SeriesPlayback.Full })
    ).toEqual([item]);
    expect(
      seriesItemsForPlayback({
        item,
        editions: [],
        mode: DP1SeriesPlayback.Full,
      })
    ).toEqual([item]);
  });
});

/** An ordinary item wholly unrelated to any series: no provenance at all. */
function ordinaryItem(id: string): DP1Item {
  return {
    id,
    source: `https://cdn.artworks.feralfile.io/previews/${id}.mp4`,
    license: DP1License.Open,
  };
}

describe('narrowSeriesPlaylist: the integration point for a whole playlist', () => {
  it('an empty playlist stays empty', () => {
    const { items, mapIndex } = narrowSeriesPlaylist([]);
    expect(items).toEqual([]);
    expect(mapIndex(0)).toBe(0);
  });

  it('a playlist of only ordinary items is untouched', () => {
    const items = [ordinaryItem('a'), ordinaryItem('b')];
    const result = narrowSeriesPlaylist(items);
    expect(result.items).toEqual(items);
    expect(result.mapIndex(1)).toBe(1);
  });

  it('a single unexpanded series item plays itself, whatever the mode', () => {
    const item = seriesItem({ seriesPlayback: DP1SeriesPlayback.Full });
    expect(narrowSeriesPlaylist([item]).items).toEqual([item]);
    expect(
      narrowSeriesPlaylist([item], DP1SeriesPlayback.First).items
    ).toEqual([item]);
  });

  it('an already-expanded run defaults to its first edition (no override)', () => {
    const editions = [edition(0), edition(1), edition(2)];
    const { items, mapIndex } = narrowSeriesPlaylist(editions);
    expect(items).toEqual([editions[0]]);
    // Every raw position in the collapsed run lands on its one survivor.
    expect(mapIndex(0)).toBe(0);
    expect(mapIndex(1)).toBe(0);
    expect(mapIndex(2)).toBe(0);
  });

  it('an already-expanded run plays whole under a Full override, each edition keeping its own index', () => {
    const editions = [edition(0), edition(1), edition(2)];
    const { items, mapIndex } = narrowSeriesPlaylist(
      editions, DP1SeriesPlayback.Full);
    expect(items).toEqual(editions);
    // Regression: every raw position used to collapse onto the group's
    // first output slot even under Full, so a moveToArtwork(2) (or this
    // codebase's own index-echo, CanvasService.publishIndexUpdate) would
    // snap back to edition 0 instead of landing on the edition it named.
    expect(mapIndex(0)).toBe(0);
    expect(mapIndex(1)).toBe(1);
    expect(mapIndex(2)).toBe(2);
  });

  it('a Random override on an expanded run also collapses to first', () => {
    const editions = [edition(0), edition(1)];
    expect(
      narrowSeriesPlaylist(editions, DP1SeriesPlayback.Random).items
    ).toEqual([editions[0]]);
  });

  it('an unexpanded item followed by its own editions expands under Full, each edition keeping its own index', () => {
    const seriesWithEditions = seriesItem({ seriesPlayback: DP1SeriesPlayback.Full });
    const editions = [edition(0), edition(1)];
    const { items, mapIndex } = narrowSeriesPlaylist(
      [seriesWithEditions, ...editions]);
    expect(items).toEqual(editions);
    // raw 0 is the series item itself, dropped in favor of its editions;
    // raw 1/2 are the editions, each keeping its own position in the output.
    expect(mapIndex(0)).toBe(0);
    expect(mapIndex(1)).toBe(0);
    expect(mapIndex(2)).toBe(1);
  });

  it('a lone edition with a seriesId, no run, plays as itself', () => {
    const lone = edition(0);
    expect(narrowSeriesPlaylist([lone], DP1SeriesPlayback.Full).items).toEqual([
      lone,
    ]);
  });
});

describe('narrowSeriesPlaylist: mapIndex and rawIndexOf across a mixed playlist', () => {
  it('a playlist mixing series and ordinary items narrows only the group, in place', () => {
    const before = ordinaryItem('before');
    const after = ordinaryItem('after');
    const editions = [edition(0), edition(1), edition(2)];
    const items = [before, ...editions, after];

    const { items: narrowed, mapIndex } = narrowSeriesPlaylist(items);
    expect(narrowed).toEqual([before, editions[0], after]);
    // before (raw 0) and after (raw 4) keep their own slot in the narrowed
    // output; every raw index inside the group (1,2,3) lands on its survivor.
    expect(mapIndex(0)).toBe(0);
    expect(mapIndex(1)).toBe(1);
    expect(mapIndex(2)).toBe(1);
    expect(mapIndex(3)).toBe(1);
    expect(mapIndex(4)).toBe(2);
  });

  it('mapIndex clamps an out-of-range raw index instead of throwing', () => {
    const { mapIndex } = narrowSeriesPlaylist([ordinaryItem('a')]);
    expect(mapIndex(-1)).toBe(0);
    expect(mapIndex(99)).toBe(0);
  });

  describe('rawIndexOf: the inverse, resolved by construction and not by id', () => {
    it('round-trips through mapIndex for a mixed playlist', () => {
      const before = ordinaryItem('before');
      const after = ordinaryItem('after');
      const editions = [edition(0), edition(1), edition(2)];
      const { items: narrowed, rawIndexOf } = narrowSeriesPlaylist(
        [before, ...editions, after]);
      expect(narrowed).toEqual([before, editions[0], after]);
      // Local 0 ("before") -> its own raw position; local 1 (the group's
      // survivor) -> the group's own raw position, not edition 1 or 2's;
      // local 2 ("after") -> its own raw position, shifted by the collapse.
      expect(rawIndexOf(0)).toBe(0);
      expect(rawIndexOf(1)).toBe(1);
      expect(rawIndexOf(2)).toBe(4);
    });

    it('resolves a duplicate id correctly where an id lookup could not', () => {
      // Two distinct raw slots sharing one id — a real, already-tested
      // shape elsewhere in this player (the same artwork cast twice).
      // Nothing here is a series item, so narrowing is a pure pass-through;
      // rawIndexOf must still tell the two slots apart.
      const twice = ordinaryItem('same-id');
      const { items: narrowed, rawIndexOf } = narrowSeriesPlaylist(
        [twice, twice]);
      expect(narrowed).toEqual([twice, twice]);
      expect(rawIndexOf(0)).toBe(0);
      expect(rawIndexOf(1)).toBe(1);
    });

    it('resolves every raw position in an already-expanded run under Full', () => {
      const editions = [edition(0), edition(1), edition(2)];
      const { rawIndexOf } = narrowSeriesPlaylist(
        editions, DP1SeriesPlayback.Full);
      expect(rawIndexOf(0)).toBe(0);
      expect(rawIndexOf(1)).toBe(1);
      expect(rawIndexOf(2)).toBe(2);
    });

    it('clamps an out-of-range local index instead of throwing', () => {
      const { rawIndexOf } = narrowSeriesPlaylist([ordinaryItem('a')]);
      expect(rawIndexOf(-1)).toBe(0);
      expect(rawIndexOf(99)).toBe(0);
    });
  });
});
