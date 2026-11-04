import {
  PLAYBACK_OUTCOME_RING_SIZE,
  PlaybackOutcomeEntry,
  PlaybackOutcomeInput,
  PlaybackOutcomes,
} from '@/models/media_health.model';

/**
 * The per-play outcome ring reported on `checkStatus.outcomes`.
 *
 * Controld drains it on its 5 s poll and dedupes by `(castSeq, seq)`, so the
 * ring never acknowledges or removes on read: a poll that lands between two
 * failures still sees both, and a poll that misses 64 outcomes sees a `seq`
 * gap rather than silence. Both counters restart with the page, which is why
 * `seq` is monotonic for the page lifetime and never reset per cast: a
 * drained `seq` that goes backwards tells controld the player restarted.
 *
 * In memory only. Nothing here is persisted, and a failed status read never
 * blocks playback; the ring is observability, not a gate.
 */
export class PlaybackOutcomeRing {
  private entries: PlaybackOutcomeEntry[] = [];
  private seq = 0;
  private castSeq = 0;

  /** Label every later entry with a new cast. Called per accepted Now Display. */
  beginCast(): void {
    this.castSeq += 1;
  }

  /** Append an entry, evicting the oldest past the ring size. */
  record(input: PlaybackOutcomeInput): PlaybackOutcomeEntry {
    this.seq += 1;
    const entry: PlaybackOutcomeEntry = {
      ...input,
      seq: this.seq,
      at: new Date().toISOString(),
    };
    this.entries.push(entry);
    if (this.entries.length > PLAYBACK_OUTCOME_RING_SIZE) {
      this.entries.splice(0, this.entries.length - PLAYBACK_OUTCOME_RING_SIZE);
    }
    return entry;
  }

  /** A copy for the status reply; callers cannot mutate the ring through it. */
  snapshot(): PlaybackOutcomes {
    return { castSeq: this.castSeq, entries: [...this.entries] };
  }
}
