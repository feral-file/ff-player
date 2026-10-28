import {
  DP1Item,
  DP1ProvenanceType,
  DP1SeriesPlayback,
} from '@/models/dp1.model';

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
  if (!isSeriesItem(item)) return DP1SeriesPlayback.First;
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
  if (mode === DP1SeriesPlayback.Full && editions?.length) return editions;
  return [item];
}
