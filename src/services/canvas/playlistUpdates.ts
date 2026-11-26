import { NO_DURATION_VALUE } from '@/constants';
import { CastInfo, RenderStatus } from '@/models';
import { DP1Call, DP1Item } from '@/models/dp1.model';
import { deepEqual } from '@/utils/helper';
import { resolveItemDuration } from '@/utils/playlist';
import { stripPlaylistSignature } from '../contentPolicy';

type RefreshContent = Pick<DP1Call, 'items' | 'defaults'>;

/**
 * Whether a refresh leaves playback as it is: the same playlist `defaults`, and
 * item lists that match once each side's durations are resolved. Resolution
 * happens on throwaway copies — neither document is rewritten. It is what
 * keeps a snapshot written by an older build (durations injected into the
 * items) from looking changed against the same document re-sent.
 */
export function isUnchangedRefresh(
  current: RefreshContent,
  next: RefreshContent
): boolean {
  const resolved = ({ items, defaults }: RefreshContent) =>
    (items ?? []).map(item => ({
      ...item,
      duration: resolveItemDuration(item, defaults),
    }));
  return (
    deepEqual(current.defaults ?? {}, next.defaults ?? {}) &&
    deepEqual(resolved(current), resolved(next))
  );
}

/**
 * The list a refresh installs: the active playlist's metadata with the new
 * document's items and `defaults`. It is a mix nobody signed, so the signature
 * goes. `comparison` holds the unshuffled items: when only `defaults` changed,
 * the order on screen (`showing`) is kept, so a shuffle is not undone.
 */
export function refreshedPlaylist(
  comparison: DP1Call,
  showing: DP1Item[],
  next: RefreshContent
): DP1Call {
  const defaultsOnly = deepEqual(comparison.items ?? [], next.items ?? []);
  return stripPlaylistSignature({
    ...comparison,
    defaults: next.defaults,
    items: defaultsOnly ? showing : (next.items ?? []),
  });
}

/**
 * Drop the signature from a stored snapshot whose items an older build rewrote.
 *
 * Builds before this one wrote the resolved `duration` into the items and kept
 * the signature, and a stored row does not say which build wrote it. The two
 * values they injected are the marker: the internal hold sentinel, or the
 * playlist's own `defaults.duration`. A document that authored either value
 * itself loses its signature on restore too — the safe direction, since a
 * missing signature claims nothing while a stale one claims a lie.
 */
export function stripRewrittenSignature(playlist: DP1Call): DP1Call {
  const injected = [NO_DURATION_VALUE, playlist.defaults?.duration];
  const rewritten = playlist.items?.some(
    item => item.duration !== undefined && injected.includes(item.duration)
  );
  return rewritten ? stripPlaylistSignature(playlist) : playlist;
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
