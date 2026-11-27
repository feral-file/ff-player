import type { CastInfo } from '@/models/cast_info.model';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import {
  ContentContext,
  ContentPolicy,
  filterContent,
  stripPlaylistSignature,
} from '@/services/contentPolicy';

/**
 * The order the wall plays a cast in, kept OUTSIDE its DP-1 document.
 *
 * `cast.playlist` is the signed document as it was admitted and persistence
 * stores it, so reordering its `items` in place would keep a signature over
 * bytes nobody signed (DP-1 §7.1). Shuffle therefore writes `cast.playOrder`
 * instead: `playOrder[slot]` is the position in
 * `playlist.items` played at that slot. Absent means document order.
 *
 * `cast.index` counts slots in PLAY order. Anything that pairs `index` with a
 * work must read `playItems(cast)`, never `cast.playlist.items`.
 */
type OrderedCast = Pick<CastInfo, 'playlist' | 'playOrder'>;

/** The stored order when it is a permutation of the document, else nothing. */
function validOrder(cast: OrderedCast): number[] | undefined {
  const length = cast.playlist?.items?.length ?? 0;
  const order: unknown = cast.playOrder;
  const isPermutation =
    Array.isArray(order) &&
    order.length === length &&
    new Set(order).size === length &&
    order.every(
      at => Number.isInteger(at) && Number(at) >= 0 && Number(at) < length
    );
  return isPermutation ? (order as number[]) : undefined;
}

/** The cast's works in the order they play. */
export function playItems(cast: OrderedCast | null | undefined): DP1Item[] {
  const items = cast?.playlist?.items ?? [];
  const order = cast ? validOrder(cast) : undefined;
  return order ? order.map(at => items[at]) : items;
}

/**
 * The playlist as `checkStatus` reports it: the works in the order they play.
 * While that differs from the document it is a copy nobody signed, so it
 * carries no signature; otherwise it is the document itself.
 */
export function playedPlaylist(cast: OrderedCast): DP1Call | undefined {
  const document = cast.playlist;
  const items = playItems(cast);
  const reordered = items.some((item, at) => item !== document?.items?.[at]);
  return document && reordered
    ? stripPlaylistSignature({ ...document, items })
    : document;
}

/** Where a play slot sits in the document. */
export function documentIndex(cast: OrderedCast, slot: number): number {
  return validOrder(cast)?.[slot] ?? slot;
}

/** A shuffled order that keeps the work at `slot` playing, now as slot 0. */
export function shuffledOrder(cast: OrderedCast, slot: number): number[] {
  const order =
    validOrder(cast) ?? (cast.playlist?.items ?? []).map((_, at) => at);
  const rest = order.filter((_, at) => at !== slot);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [order[slot], ...rest];
}

/**
 * Content admission for a cast: blocked works leave the document (which then
 * loses its signature, see filterContent) and the order is renumbered around
 * them. `index` is resolved in play order. Null when nothing is allowed.
 */
export function admitCast(
  cast: CastInfo,
  policy: ContentPolicy,
  context: ContentContext
): CastInfo | null {
  const document = cast.playlist;
  if (!document) {
    return cast;
  }
  const played = filterContent(
    { ...document, items: playItems(cast) },
    policy,
    context,
    cast.index ?? 0
  );
  if (!played.playlist) {
    return null;
  }
  if (!played.blocked) {
    return { ...cast, index: played.index };
  }
  const filtered = filterContent(document, policy, context).playlist;
  if (!filtered) {
    return null;
  }
  const kept = new Set(filtered.items);
  const renumbered = new Map<number, number>();
  (document.items ?? []).forEach((item, at) => {
    if (kept.has(item)) {
      renumbered.set(at, renumbered.size);
    }
  });
  const playOrder = validOrder(cast)?.flatMap(at => {
    const next = renumbered.get(at);
    return next === undefined ? [] : [next];
  });
  return {
    ...cast,
    playlist: filtered,
    index: played.index,
    ...(playOrder ? { playOrder } : {}),
  };
}
