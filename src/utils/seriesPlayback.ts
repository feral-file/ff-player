import {
  DP1Item,
  DP1ProvenanceType,
  DP1SeriesPlayback,
} from '@/models/dp1.model';
import { rawSlotIdentities, withRawSlotIdentity } from '@/utils/playlist';

/** Set of known `DP1SeriesPlayback` string values from cast / wire payloads. */
export const VALID_SERIES_PLAYBACK = new Set<string>(
  Object.values(DP1SeriesPlayback)
);

/**
 * Maps a wire / persisted series-playback string onto `DP1SeriesPlayback`.
 *
 * The value reaches this player from publishers that ship independently of
 * it, so an unknown or missing one falls back to `First` — the mode that
 * needs nothing but the item itself — rather than refusing the item. Mirrors
 * `coerceTombstoneMode` and `coerceLoopMode`.
 */
export function coerceSeriesPlayback(
  raw: string | undefined | null
): DP1SeriesPlayback {
  return raw && VALID_SERIES_PLAYBACK.has(raw)
    ? (raw as DP1SeriesPlayback)
    : DP1SeriesPlayback.First;
}

/** Whether [item] is a series rather than one edition (core 1.1.0 §6). */
export function isSeriesItem(item: Pick<DP1Item, 'provenance'>): boolean {
  return item.provenance?.type === DP1ProvenanceType.SeriesRegistry;
}

/**
 * The mode a series item actually plays in.
 *
 * The item states the publisher's intent and the device setting overrides
 * it — the same cascade `resolveSlotDurationSeconds` gives `duration`, and
 * for the same reason: what the viewer set on this screen beats what the
 * document asked for. `deviceOverride` of null/undefined means "auto" (no
 * override), not `First`.
 *
 * FF1 resolves only two outcomes. `Random` means one edition re-rolled each
 * loop, which this player does not do, so it collapses to `First` here
 * rather than at each call site — one place decides, and a caller only ever
 * sees a mode it can honour.
 */
export function resolveSeriesPlayback({
  item,
  deviceOverride,
}: {
  item: Pick<DP1Item, 'provenance' | 'seriesPlayback'>;
  deviceOverride?: DP1SeriesPlayback | null;
}): DP1SeriesPlayback.Full | DP1SeriesPlayback.First {
  if (!isSeriesItem(item)) {return DP1SeriesPlayback.First;}
  const effective = deviceOverride ?? item.seriesPlayback;
  return coerceSeriesPlayback(effective) === DP1SeriesPlayback.Full
    ? DP1SeriesPlayback.Full
    : DP1SeriesPlayback.First;
}

/**
 * The items one series item plays, given the editions already resolved for
 * it and the mode in force.
 *
 * `editions` is what the art catalog returned for the series, which reaches
 * this player already expanded: feral-controld asks the catalog, which reads
 * the series' `tokenDataURI` from the SeriesRegistry contract and hands back
 * DP-1 items that have already inherited from the series item. `First` keeps
 * the item itself, whose `source` is the representative edition, so narrowing
 * never needs a fetch and the device override is free in both directions.
 */
export function seriesItemsForPlayback({
  item,
  editions,
  mode,
}: {
  item: DP1Item;
  editions?: DP1Item[];
  mode: DP1SeriesPlayback.Full | DP1SeriesPlayback.First;
}): DP1Item[] {
  if (mode === DP1SeriesPlayback.Full && editions?.length) {return editions;}
  return [item];
}

/** Normalizes `contract.seriesId` (integer or decimal string) for grouping. */
function seriesIdKey(item: DP1Item): string | undefined {
  const id = item.provenance?.contract?.seriesId;
  return id === undefined ? undefined : String(id);
}

/** Maps a position in the narrowing input to its position in the output. */
type RawIndexMap = (rawIndex: number) => number;

/** `narrowSeriesPlaylist`'s result: the narrowed items, and how to carry an
 * index across the narrowing in either direction. */
export interface NarrowedSeriesPlaylist {
  items: DP1Item[];
  /** A raw-playlist index (from `castInfo.index`, or an item's prior raw
   * position) to its position in `items`. */
  mapIndex: RawIndexMap;
  /**
   * The inverse: a position in `items` back to a raw-playlist index — the
   * one the caller should publish as `castInfo.index`, which CanvasService
   * never narrows and every other reader (moveToArtwork, getStatus,
   * triggerArtworkRefresh) expects in raw space. Exact by construction, not
   * an id search: two raw items can legitimately share an `id` (the same
   * artwork played twice in one playlist), which an id lookup cannot tell
   * apart (run-reviewer F1, round 2) but this mapping, built alongside
   * `mapIndex` from the same traversal, never confuses.
   */
  rawIndexOf: RawIndexMap;
}

/** Narrowing's working state: the input, the override, and the output
 * being built up (so the per-span helpers below stay under the four-param
 * lint cap instead of threading five or six positional arguments). */
interface NarrowingContext {
  items: DP1Item[];
  deviceOverride: DP1SeriesPlayback | null | undefined;
  outItems: DP1Item[];
  rawToOut: number[];
  outToRaw: number[];
}

/** The raw index past the run starting at `start` that shares `sid`. */
function seriesIdRunEnd(items: DP1Item[], start: number, sid: string): number {
  let end = start;
  while (
    end < items.length &&
    !isSeriesItem(items[end]) &&
    seriesIdKey(items[end]) === sid
  ) {
    end += 1;
  }
  return end;
}

/**
 * Narrows one unexpanded series item — plus, for robustness, a following
 * run sharing its seriesId, though the real daemon never actually sends
 * both. Pushes the result onto `ctx.outItems`/`ctx.rawToOut`; returns the
 * raw index past it.
 */
function narrowUnexpandedSeriesItem(ctx: NarrowingContext, i: number): number {
  const { items, deviceOverride, outItems, rawToOut, outToRaw } = ctx;
  const item = items[i];
  const sid = seriesIdKey(item);
  const j = sid === undefined ? i + 1 : seriesIdRunEnd(items, i + 1, sid);
  const editions = j > i + 1 ? items.slice(i + 1, j) : undefined;
  const mode = resolveSeriesPlayback({ item, deviceOverride });
  const narrowed = seriesItemsForPlayback({ item, editions, mode });
  const outStart = outItems.length;
  outItems.push(...narrowed);
  if (narrowed === editions) {
    // Full, with editions present: the series item itself is dropped in
    // favor of its editions, each landing at its own position in the
    // output — not all collapsed onto outStart, or a raw index past the
    // first edition (a later moveToArtwork, or this file's own
    // publishIndexUpdate echo) would snap back to the first one.
    rawToOut[i] = outStart;
    for (let k = 0; k < editions.length; k += 1) {
      rawToOut[i + 1 + k] = outStart + k;
      outToRaw[outStart + k] = i + 1 + k;
    }
  } else {
    // First, or Full with nothing to expand into: one survivor, so every
    // raw position in the span — the item and any editions with it —
    // lands on that same output position; the survivor's own raw position
    // is `i`, the item itself.
    for (let raw = i; raw < j; raw += 1) {rawToOut[raw] = outStart;}
    outToRaw[outStart] = i;
  }
  return j;
}

/**
 * Narrows a run of already-expanded editions sharing one seriesId, none of
 * them `isSeriesItem` — `feral-controld`'s normal shape. Pushes the result
 * onto `ctx.outItems`/`ctx.rawToOut` and returns the raw index past the
 * run, or `null` when `i` is not the start of a run (a lone item: nothing
 * to narrow, the outcome is the same either way).
 */
function narrowExpandedRun(
  ctx: NarrowingContext,
  i: number,
  sid: string
): number | null {
  const { items, deviceOverride, outItems, rawToOut, outToRaw } = ctx;
  const j = seriesIdRunEnd(items, i + 1, sid);
  if (j - i <= 1) {return null;}

  // Nothing here states the publisher's intent any more, so the override
  // alone decides, First by default.
  const run = items.slice(i, j);
  const mode =
    coerceSeriesPlayback(deviceOverride) === DP1SeriesPlayback.Full
      ? DP1SeriesPlayback.Full
      : DP1SeriesPlayback.First;
  const narrowed = seriesItemsForPlayback({ item: run[0], editions: run, mode });
  const outStart = outItems.length;
  outItems.push(...narrowed);
  if (narrowed === run) {
    // Full: the whole run plays, each edition keeping its own relative
    // position in the output — see the matching note above.
    for (let k = 0; k < run.length; k += 1) {
      rawToOut[i + k] = outStart + k;
      outToRaw[outStart + k] = i + k;
    }
  } else {
    for (let raw = i; raw < j; raw += 1) {rawToOut[raw] = outStart;}
    outToRaw[outStart] = i; // the survivor, run[0], at its own raw position.
  }
  return j;
}

/**
 * Narrows a whole playlist's series groups down to what the resolved mode
 * actually plays — the integration point `isSeriesItem` /
 * `resolveSeriesPlayback` / `seriesItemsForPlayback` exist for. Call sites
 * read this instead of `castInfo.playlist.items` directly, so a
 * `seriesRegistry` item or an already-expanded series group plays per its
 * resolved mode rather than being treated as ordinary items.
 *
 * `feral-controld`'s `expandSeriesItems` (feral-file/ffos-user#421) REPLACES
 * a series item with the editions the catalog returns for it — it never
 * sends both, and it never copies the series item's own `seriesPlayback`
 * onto them. So two shapes reach this player, handled differently:
 *
 * - **Unexpanded**: the series item itself (expansion failed, or nothing
 * expanded it). `isSeriesItem` finds it; its own `seriesPlayback` still
 * applies via `resolveSeriesPlayback`. With no editions alongside it,
 * `seriesItemsForPlayback` always keeps it as the one playable item — this
 * is the common, no-op case: nothing here changes what already plays.
 * - **Already expanded**: a run of edition items sharing one
 * `contract.seriesId`, none of them `isSeriesItem`. The publisher's own
 * intent is gone with the replaced item, so only the device override is
 * left to decide, defaulting to `First` exactly as an absent item-level
 * `seriesPlayback` would. `Full` leaves the run as `feral-controld` sent it
 * (nothing to do); `First` collapses it to the run's own first item.
 *
 * A contiguous run is identified by `contract.seriesId` alone, not by
 * position: a playlist mixing series groups with ordinary items narrows
 * only the groups, in place, preserving every other item and the overall
 * order. `mapIndex` lets a caller carry a raw index (or an item found by id
 * in the raw array) across the narrowing without recomputing it by hand —
 * every raw position maps to where its (possibly collapsed) group landed.
 */
export function narrowSeriesPlaylist(
  items: DP1Item[],
  deviceOverride?: DP1SeriesPlayback | null
): NarrowedSeriesPlaylist {
  const ctx: NarrowingContext = {
    items,
    deviceOverride,
    outItems: [],
    rawToOut: new Array<number>(items.length).fill(0),
    outToRaw: [],
  };
  const { outItems, rawToOut, outToRaw } = ctx;

  let i = 0;
  while (i < items.length) {
    const item = items[i];

    if (isSeriesItem(item)) {
      i = narrowUnexpandedSeriesItem(ctx, i);
      continue;
    }

    const sid = seriesIdKey(item);
    const runEnd = sid === undefined ? null : narrowExpandedRun(ctx, i, sid);
    if (runEnd !== null) {
      i = runEnd;
      continue;
    }

    rawToOut[i] = outItems.length;
    outToRaw[outItems.length] = i;
    outItems.push(item);
    i += 1;
  }

  // Every survivor carries the identity of the raw slot it came from, not of
  // the neighbours narrowing has left it with. Narrowing is the one operation
  // that changes what sits ahead of a slot while the artwork there never
  // leaves the screen, so a positionally-counted identity would call it a new
  // showing and replay it — see `RawSlotIdentity`.
  const rawSlots = rawSlotIdentities(items);
  const playableItems = outItems.map((item, local) =>
    withRawSlotIdentity(item, rawSlots[outToRaw[local]])
  );

  return {
    items: playableItems,
    mapIndex: rawIndex => {
      if (!rawToOut.length) {return 0;}
      const clamped = Math.min(Math.max(rawIndex, 0), rawToOut.length - 1);
      return rawToOut[clamped];
    },
    rawIndexOf: localIndex => {
      if (!outToRaw.length) {return 0;}
      const clamped = Math.min(Math.max(localIndex, 0), outToRaw.length - 1);
      return outToRaw[clamped];
    },
  };
}
