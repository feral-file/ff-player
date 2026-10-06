import { DP1Item } from '@/models/dp1.model';

/**
 * Does this refresh replace the SOURCE of the work currently on screen?
 *
 * A refreshed list that keeps the current work's id but changes its source is
 * a replacement of what the viewer is looking at, not a queued change to the
 * list. It cannot use the deferred path: that waits for a slot advance, which
 * an untimed work never reaches, and the rendering gate meanwhile matches the
 * slot it is showing by id AND source, so it would find nothing and unmount.
 * The wall would stay dark until something else cast. Such a refresh has to be
 * handed over immediately.
 */
export function isSourceReplacement(
  showing: DP1Item | undefined,
  incoming: DP1Item[]
): boolean {
  if (!showing) {
    return false;
  }
  const replacement = incoming.find(item => item.id === showing.id);
  return replacement !== undefined && replacement.source !== showing.source;
}
