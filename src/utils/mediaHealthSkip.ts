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
