import type { DP1Item } from '@/models/dp1.model';

/**
 * The work a controller asked a Now Display to open on
 * (`displayPlaylist.request.startItem`).
 *
 * A work, not an index: for a playlist URL or a dynamic query the controller
 * does not know the order the device will resolve, and the list this player
 * plays is the one left after its own content-policy admission. So the
 * position is resolved here, against that final list, and nowhere upstream.
 */
export interface StartItem {
  id?: string;
  source?: string;
}

/**
 * A string that names something, exactly as given, or undefined. Trimming is
 * used only to tell a blank value from a usable one: identities are compared
 * as the exact strings both sides hold, so padding is never normalized away.
 */
const usable = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/**
 * The slot of `items` a cast should open on for the requested `startItem`,
 * or undefined to start at the beginning.
 *
 * The id is searched across the whole list first; the source is consulted
 * only when no item carries the id. A dynamic playlist regenerates item ids
 * on every resolution, so the source is the only identity that survives
 * there, but two members of a series can share one source, so an id that is
 * present always wins. The first match wins when a work repeats.
 *
 * The argument arrives off the wire and is parsed tolerantly: anything that
 * is not an object with a usable string in `id` or `source` asks for
 * nothing. A work that is not in the list is not an error either. The cast
 * starts at its beginning, which is what it did before this argument existed.
 *
 * Ids and sources are compared exactly, as the strings both sides hold.
 */
export function startItemIndex(
  items: DP1Item[],
  startItem: unknown
): number | undefined {
  if (
    typeof startItem !== 'object' ||
    startItem === null ||
    Array.isArray(startItem)
  ) {
    return undefined;
  }
  const { id: rawId, source: rawSource } = startItem as Record<string, unknown>;
  const id = usable(rawId);
  if (id !== undefined) {
    // An item off the wire may carry no id at all; `===` on undefined is
    // simply no match, so nothing here can throw on it.
    const byId = items.findIndex(item => (item.id as unknown) === id);
    if (byId >= 0) {
      return byId;
    }
  }
  const source = usable(rawSource);
  if (source !== undefined) {
    const bySource = items.findIndex(item => item.source === source);
    if (bySource >= 0) {
      return bySource;
    }
  }
  return undefined;
}
