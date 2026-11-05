import { LoopMode } from '@/models/cast_info.model';
import type { DP1Item } from '@/models/dp1.model';
import { normalizePlaylistIndex } from './playlist';

interface HintedSkipOptions {
  index: number;
  items: DP1Item[];
  loopMode: LoopMode;
  isBroken: (source: string) => boolean;
}

/**
 * Where a selection lands once controld's broken-source hints are applied
 * (mediaHealth contract v1).
 *
 * The timeline calls this at every selection site, BEFORE the index is
 * published, so a hinted slot is passed over without ever mounting; the cast
 * command calls it too, so render-status continuity is judged against the
 * slot that will actually play rather than the requested one. The
 * search walks forward in play order from the requested slot and stops at the
 * first source without a hint; `playlist` wraps, `none` does not, and `one`
 * never moves because the viewer asked for exactly that work.
 *
 * Tolerance is the rule when nothing else is playable: the requested slot is
 * returned unchanged and nothing is marked skipped, so an all-broken map
 * (which controld already refuses to cast) or a tail of hinted works under
 * repeat-off still lands on a slot the ordinary retry/skip budget can judge.
 * A hint can therefore never blank the wall.
 */
export function resolveHintedSkip(options: HintedSkipOptions): {
  index: number;
  skipped: DP1Item[];
} {
  const { items, loopMode, isBroken } = options;
  const unchanged = { index: options.index, skipped: [] as DP1Item[] };
  if (!items.length || loopMode === LoopMode.one) {
    return unchanged;
  }
  const start = normalizePlaylistIndex(options.index, items.length);
  if (!isBroken(items[start].source)) {
    return unchanged;
  }
  const skipped: DP1Item[] = [items[start]];
  for (let step = 1; step < items.length; step += 1) {
    const candidate = start + step;
    if (loopMode === LoopMode.none && candidate >= items.length) {
      break;
    }
    const index = normalizePlaylistIndex(candidate, items.length);
    if (!isBroken(items[index].source)) {
      return { index, skipped };
    }
    skipped.push(items[index]);
  }
  return unchanged;
}

interface HintSkippedOptions {
  items: DP1Item[];
  /** The published index: the slot on the wall, or about to be. */
  index: number | undefined;
  loopMode: LoopMode;
  isBroken: (source: string) => boolean;
}

/**
 * The indices of `items` the player is passing over because of a hint,
 * reported on `checkStatus.hintSkipped` (mediaHealth contract v1).
 *
 * Controld copies this per item into `player_status.mediaHealth[i].skipped`,
 * so the app's "Skip" badge reflects what the player actually does rather than
 * what controld last observed: a source controld did not hint (an expired
 * verdict, a replayable one, a push still in flight) is never reported here,
 * and a hint the player still holds is reported until the next push replaces
 * it.
 *
 * Same rules as `resolveHintedSkip`, evaluated for every slot at once instead
 * of walking from each: a hinted slot is skipped exactly when the resolver
 * would move off it. `one` ignores hints; `playlist` skips every hinted slot
 * while any unhinted one exists; `none` skips a hinted slot only when an
 * unhinted one follows it, because the tolerated tail still plays. The
 * published slot is never listed: the resolver only ever lands there, so it is
 * on the wall (a tolerated hint, or one that arrived on a refresh mid-play),
 * and calling the visible work skipped would be the very mismatch this field
 * exists to remove.
 */
export function hintSkippedIndices(options: HintSkippedOptions): number[] {
  const { items, loopMode, isBroken } = options;
  if (!items.length || loopMode === LoopMode.one) {
    return [];
  }
  const broken = items.map(item => isBroken(item.source));
  const lastPlayable = broken.lastIndexOf(false);
  if (lastPlayable < 0) {
    return [];
  }
  const current =
    options.index === undefined
      ? -1
      : normalizePlaylistIndex(options.index, items.length);
  const skipped: number[] = [];
  broken.forEach((hinted, index) => {
    const leavable = loopMode !== LoopMode.none || index < lastPlayable;
    if (hinted && leavable && index !== current) {
      skipped.push(index);
    }
  });
  return skipped;
}
