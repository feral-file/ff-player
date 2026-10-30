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
import {
  RAW_SLOT_IDENTITY,
  showingIdentityFor,
  type RawSlotIdentity,
} from '@/utils/playlist';
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

/**
 * Narrowed items with their `RawSlotIdentity` stamp stripped, so an assertion
 * about WHICH items play reads the way it did before the stamp existed. The
 * stamp has its own cases below: it is invisible to `JSON.stringify` — and so
 * to the persisted recently-played record — but not to `toEqual`.
 */
function playableContent(items: DP1Item[]): DP1Item[] {
  // Object.entries lists string keys only, so the Symbol-keyed stamp is gone
  // while every wire field survives — including the undefined-valued ones a
  // JSON round-trip would drop, which the assertions below still compare.
  return items.map(item => Object.fromEntries(Object.entries(item)) as DP1Item);
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
    expect(playableContent(result.items)).toEqual(items);
    expect(result.mapIndex(1)).toBe(1);
  });

  it('a single unexpanded series item plays itself, whatever the mode', () => {
    const item = seriesItem({ seriesPlayback: DP1SeriesPlayback.Full });
    expect(playableContent(narrowSeriesPlaylist([item]).items)).toEqual([item]);
    expect(
      playableContent(narrowSeriesPlaylist([item], DP1SeriesPlayback.First).items)
    ).toEqual([item]);
  });

  it('an already-expanded run defaults to its first edition (no override)', () => {
    const editions = [edition(0), edition(1), edition(2)];
    const { items, mapIndex } = narrowSeriesPlaylist(editions);
    expect(playableContent(items)).toEqual([editions[0]]);
    // Every raw position in the collapsed run lands on its one survivor.
    expect(mapIndex(0)).toBe(0);
    expect(mapIndex(1)).toBe(0);
    expect(mapIndex(2)).toBe(0);
  });

  it('an already-expanded run plays whole under a Full override, each edition keeping its own index', () => {
    const editions = [edition(0), edition(1), edition(2)];
    const { items, mapIndex } = narrowSeriesPlaylist(
      editions, DP1SeriesPlayback.Full);
    expect(playableContent(items)).toEqual(editions);
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
      playableContent(narrowSeriesPlaylist(editions, DP1SeriesPlayback.Random).items)
    ).toEqual([editions[0]]);
  });

  it('an unexpanded item followed by its own editions expands under Full, each edition keeping its own index', () => {
    const seriesWithEditions = seriesItem({ seriesPlayback: DP1SeriesPlayback.Full });
    const editions = [edition(0), edition(1)];
    const { items, mapIndex } = narrowSeriesPlaylist(
      [seriesWithEditions, ...editions]);
    expect(playableContent(items)).toEqual(editions);
    // raw 0 is the series item itself, dropped in favor of its editions;
    // raw 1/2 are the editions, each keeping its own position in the output.
    expect(mapIndex(0)).toBe(0);
    expect(mapIndex(1)).toBe(0);
    expect(mapIndex(2)).toBe(1);
  });

  it('a lone edition with a seriesId, no run, plays as itself', () => {
    const lone = edition(0);
    expect(
      playableContent(
        narrowSeriesPlaylist([lone], DP1SeriesPlayback.Full).items
      )
    ).toEqual([lone]);
  });
});

describe('narrowSeriesPlaylist: mapIndex and rawIndexOf across a mixed playlist', () => {
  it('a playlist mixing series and ordinary items narrows only the group, in place', () => {
    const before = ordinaryItem('before');
    const after = ordinaryItem('after');
    const editions = [edition(0), edition(1), edition(2)];
    const items = [before, ...editions, after];

    const { items: narrowed, mapIndex } = narrowSeriesPlaylist(items);
    expect(playableContent(narrowed)).toEqual([before, editions[0], after]);
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
      expect(playableContent(narrowed)).toEqual([before, editions[0], after]);
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
      expect(playableContent(narrowed)).toEqual([twice, twice]);
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

/**
 * The one thing narrowing must NOT change about a slot it leaves alone: who
 * that slot is. The renderer's mount decision, the repeat-off hold and the
 * preserved deadline are all keyed on `showingIdentityFor`, so a key that
 * moved when the list ahead of it moved replayed an artwork that had never
 * left the screen (feralfile-bot F7, review of 5936d6c).
 */
describe('narrowSeriesPlaylist: a surviving slot keeps its raw identity', () => {
  /** The showing key of the last slot once this mode has been applied. */
  function tailShowing(
    raw: DP1Item[],
    mode?: DP1SeriesPlayback
  ): string {
    const { items } = narrowSeriesPlaylist(raw, mode);
    return showingIdentityFor(items, items.length - 1);
  }

  it('a repeated tail survives its earlier copy being narrowed away', () => {
    // The bot's own case: the first edition of the group and the tail are the
    // same artwork, so under Full the tail is occurrence 1 — and collapsing
    // the group to its first edition deletes the occurrence it counted.
    const tail = edition(1);
    const raw = [edition(0), tail, ordinaryItem('separator'), tail];
    expect(tailShowing(raw, DP1SeriesPlayback.Full)).toBe(
      tailShowing(raw, DP1SeriesPlayback.First)
    );
  });

  it('an id-less tail survives an earlier group expanding ahead of it', () => {
    // No id to fall back on: `itemIdentityFor` synthesises one from the
    // position, which is exactly what a First<->Full flip changes.
    // `id` is optional in the DP-1 schema though this model types it
    // required, exactly as the route tests' own `idlessItem` does.
    const idLess = {
      source: 'https://cdn.artworks.feralfile.io/previews/untitled.mp4',
      license: DP1License.Open,
    } as DP1Item;
    const raw = [seriesItem(), edition(0), edition(1), idLess];
    expect(tailShowing(raw, DP1SeriesPlayback.Full)).toBe(
      tailShowing(raw, DP1SeriesPlayback.First)
    );
  });

  it('two copies of one artwork in one list are still two showings', () => {
    // The control: stability must not come from collapsing the two together,
    // which is what the occurrence count was there to prevent.
    const twice = ordinaryItem('twice');
    const { items } = narrowSeriesPlaylist([twice, twice]);
    expect(showingIdentityFor(items, 0)).not.toBe(
      showingIdentityFor(items, 1)
    );
  });

  it('two id-less items sharing a source are still two showings', () => {
    // `id` is optional in the DP-1 schema though this model types it
    // required, exactly as the route tests' own `idlessItem` does.
    const idLess = {
      source: 'https://cdn.artworks.feralfile.io/previews/untitled.mp4',
      license: DP1License.Open,
    } as DP1Item;
    const { items } = narrowSeriesPlaylist([idLess, idLess]);
    expect(showingIdentityFor(items, 0)).not.toBe(
      showingIdentityFor(items, 1)
    );
  });

  it('the stamp names the raw slot, not the slot it landed in', () => {
    const raw = [seriesItem(), edition(0), edition(1), ordinaryItem('tail')];
    const { items } = narrowSeriesPlaylist(raw, DP1SeriesPlayback.First);
    // First collapses raw 0..2 onto the series item, so the tail moves from
    // raw 3 to local 1 while its stamp still names raw 3's identity.
    const stamped = items[1] as DP1Item & {
      [RAW_SLOT_IDENTITY]?: RawSlotIdentity;
    };
    expect(stamped[RAW_SLOT_IDENTITY]).toEqual({
      identity: 'tail',
      occurrence: 0,
    });
  });

  it('the stamp never reaches persisted history', () => {
    // `appendRecentlyPlayed` stores the item verbatim through
    // JSON.parse(JSON.stringify(item)) under a byte budget, so the stamp has
    // to be invisible to it — that is the whole reason it is a Symbol.
    const raw = [edition(0), edition(1)];
    const { items } = narrowSeriesPlaylist(raw, DP1SeriesPlayback.Full);
    expect(JSON.parse(JSON.stringify(items))).toEqual(raw);
  });
});
