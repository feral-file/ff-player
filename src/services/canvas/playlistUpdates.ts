import { NO_DURATION_VALUE } from '@/constants';
import { CastInfo, RenderStatus } from '@/models';
import { DP1Defaults, DP1Item } from '@/models/dp1.model';
import { deepEqual } from '@/utils/helper';

/**
 * Normalize omitted durations identically for display and refresh comparisons.
 *
 * DP-1 core §4 resolves a slot's duration from the item's own `duration`,
 * then `playlist.defaults.duration`; only when neither is set does the player
 * hold the slot (NO_DURATION_VALUE). This is the single admission-time place
 * that inheritance happens: the timeline and timer paths downstream only ever
 * see the resolved number.
 */
export function normalizeItemDurations(
  items: DP1Item[],
  defaults?: Pick<DP1Defaults, 'duration'> | null
): DP1Item[] {
  return items.map(item => ({
    ...item,
    duration: item.duration ?? defaults?.duration ?? NO_DURATION_VALUE,
  }));
}

/**
 * True when `current` equals the already-normalized `next` once `current`'s
 * own omitted durations are resolved the same way (refresh no-op check).
 */
export function sameResolvedItems(
  current: DP1Item[],
  next: DP1Item[],
  defaults?: Pick<DP1Defaults, 'duration'> | null
): boolean {
  return deepEqual(normalizeItemDurations(current, defaults), next);
}

/**
 * Selected artwork identity for render-status continuity.
 * Id alone is not enough: refreshPlaylist can keep the same id while replacing
 * `source`, and status polls must not keep the prior ready/failed for the new URL.
 * Shuffle remaps that keep the same id+source intentionally preserve status.
 */
export function isSameSelectedArtworkIdentity(
  previous: DP1Item | undefined,
  next: DP1Item | undefined
): boolean {
  if (previous === undefined || next === undefined) {
    return false;
  }
  return previous.id === next.id && previous.source === next.source;
}

/**
 * Item a cast is currently pointing at, using the same wrap-around index
 * normalization the playlist route applies. Returns undefined when there is no
 * playlist to select from, so callers can tell "no selection" apart from a real
 * item instead of guessing from an out-of-range index.
 */
export function selectedPlaylistItem(
  items: DP1Item[] | undefined,
  index: number | undefined
): DP1Item | undefined {
  if (!items?.length || index === undefined) {
    return undefined;
  }
  return items.at(((index % items.length) + items.length) % items.length);
}

/**
 * Resolve the render status to publish with a cast-info update.
 *
 * Index-only transitions often spread the previous castInfo, which would keep
 * the prior artwork's ready/failed across the gap before ArtworkPlayer marks
 * pending. When the selected artwork identity (id + source) changes, force
 * pending immediately so status polls never attribute the old lifecycle to the
 * new artwork. Same-id source replacement on refresh is treated as a new load.
 */
export function resolveRenderStatusForCastInfo(
  previous: CastInfo | null,
  next: CastInfo,
  currentRenderStatus: RenderStatus | undefined
): RenderStatus | undefined {
  const previousItem = selectedPlaylistItem(
    previous?.playlist?.items,
    previous?.index
  );
  const nextItem = selectedPlaylistItem(next.playlist?.items, next.index);

  if (
    previousItem !== undefined &&
    nextItem !== undefined &&
    !isSameSelectedArtworkIdentity(previousItem, nextItem)
  ) {
    return RenderStatus.pending;
  }

  return next.renderStatus ?? currentRenderStatus ?? undefined;
}

/**
 * Whether `next` is the same playlist content as `prev`, for
 * setCastInfo's pendingRefreshArtwork guard below. Mirrors the identity
 * checks refreshPlaylist already uses elsewhere in this file (DP1Call.id,
 * then a content compare via `deepEqual`) rather than inventing a new
 * comparison: cheapest first — an assigned `playlist.id` or `playlistUrl`
 * settles it in O(1) — falling back to a full item compare only when
 * neither playlist carries a stable identity (ad-hoc/boot-restored casts).
 */
export function isSamePlaylistContent(
  prev: CastInfo | null,
  next: CastInfo
): boolean {
  const prevPlaylist = prev?.playlist;
  const nextPlaylist = next.playlist;
  if (prevPlaylist === nextPlaylist) {
    return true;
  }
  if (!prevPlaylist || !nextPlaylist) {
    return false;
  }
  if (prevPlaylist.id !== undefined || nextPlaylist.id !== undefined) {
    return prevPlaylist.id === nextPlaylist.id;
  }
  if (prev.playlistUrl !== undefined || next.playlistUrl !== undefined) {
    return prev.playlistUrl === next.playlistUrl;
  }
  return deepEqual(prevPlaylist.items ?? [], nextPlaylist.items ?? []);
}
/** Remap the selected work into an incoming unfiltered document, preferring the exact repeated slot before an id-only source replacement. */
export function refreshedSelectionIndex(
  items: DP1Item[],
  selected: DP1Item | undefined
): number {
  const exact = selected
    ? items.findIndex(
        item => item.id === selected.id && item.source === selected.source
      )
    : -1;
  const byId =
    selected && exact < 0
      ? items.findIndex(item => item.id === selected.id)
      : exact;
  return byId >= 0 ? byId : 0;
}
