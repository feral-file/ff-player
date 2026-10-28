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
  resolveSeriesPlayback,
  seriesItemsForPlayback,
} from './seriesPlayback';

// A Feral File V1–V3 series: a 256-bit id carried as decimal digits, and no
// contract address, because its editions sit under more than one.
const SERIES_ID =
  '111189432907883705479781860609730558140985427661919345637476715406273466581241';

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

function edition(n: number): DP1Item {
  return {
    id: `edition-${n}`,
    source: `https://cdn.artworks.feralfile.io/previews/scrampled/${n}.mp4`,
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

  it('Full plays the editions the chain index returned', () => {
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
