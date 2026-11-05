import type {
  MediaHealthHint,
  MediaHealthHints,
} from '@/models/media_health.model';

/**
 * The broken-source hints controld sent with the latest accepted
 * `displayPlaylist` push, keyed by `item.source` as pushed.
 *
 * Replaced whole on every accepted cast or refresh push and cleared when a
 * cast starts without one (the fallback playlist, a player-local scheduled
 * task, a disconnect), so an absent field always means "no hints" rather than
 * "unchanged". That differs from `contentContext`'s refresh rule on purpose:
 * the paired rollout means a controld that sends hints sends them on every
 * push, and one that cannot never does.
 *
 * Held OUTSIDE castInfo so it is never persisted. After a reboot the store on
 * controld is still authoritative and the next push restores the hints; until
 * then the ordinary retry/skip budget judges each work, as it does today.
 *
 * Parsing is tolerant: the hint is a projection, not a command. A malformed
 * entry is dropped, a malformed field is skipped, and nothing here can reject
 * a cast.
 */
export class MediaHealthHintStore {
  private hints: MediaHealthHints = {};

  /** Install the hints from a push; anything but a plain object clears them. */
  replace(raw: unknown): void {
    // A fresh object each time; a snapshot taken earlier stays intact.
    this.hints = parseMediaHealthHints(raw);
  }

  clear(): void {
    this.hints = {};
  }

  /** The current map, for restoring after a refused push. */
  snapshot(): MediaHealthHints {
    return this.hints;
  }

  /** Reinstate a map taken with `snapshot`. */
  restore(hints: MediaHealthHints): void {
    this.hints = hints;
  }

  /** The hint for a source, or undefined when controld did not mark it broken. */
  hint(source: string): MediaHealthHint | undefined {
    return Object.prototype.hasOwnProperty.call(this.hints, source)
      ? this.hints[source]
      : undefined;
  }

  get size(): number {
    return Object.keys(this.hints).length;
  }
}

/**
 * Normalise a pushed `mediaHealth` map. Only entries whose value is a plain
 * object survive; `category` and `reason` fall back to empty strings so a
 * hint without a readable reason still skips the work it names.
 */
export function parseMediaHealthHints(raw: unknown): MediaHealthHints {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const parsed: MediaHealthHints = {};
  for (const [source, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      continue;
    }
    const { category, reason } = value as Record<string, unknown>;
    parsed[source] = {
      category: typeof category === 'string' ? category : '',
      reason: typeof reason === 'string' ? reason : '',
    };
  }
  return parsed;
}
