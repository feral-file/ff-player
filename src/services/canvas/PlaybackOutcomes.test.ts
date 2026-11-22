import { PLAYBACK_OUTCOME_RING_SIZE } from '@/models/media_health.model';
import type { PlaybackOutcomeInput } from '@/models/media_health.model';
import { describe, expect, it } from 'vitest';
import { PlaybackOutcomeRing } from './PlaybackOutcomes';

const fail = (source: string): PlaybackOutcomeInput => ({
  kind: 'fail',
  stage: 'load',
  code: 'image',
  source,
  attempt: 1,
  elapsedMs: 10,
});

describe('PlaybackOutcomeRing', () => {
  it('starts empty at cast zero so controld can tell "nothing yet" from an old build', () => {
    expect(new PlaybackOutcomeRing().snapshot()).toEqual({
      castSeq: 0,
      entries: [],
    });
  });

  it('numbers entries monotonically for the page, across casts', () => {
    const ring = new PlaybackOutcomeRing();
    ring.beginCast();
    ring.record(fail('a'));
    ring.beginCast();
    ring.record(fail('b'));
    const { castSeq, entries } = ring.snapshot();
    expect(castSeq).toBe(2);
    expect(entries.map(entry => entry.seq)).toEqual([1, 2]);
    // Each entry keeps the generation it was recorded under: the identity
    // controld dedupes by must not change when a later cast opens.
    expect(entries.map(entry => entry.castSeq)).toEqual([1, 2]);
    expect(entries[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('exposes the current generation for the setMediaHealth fence', () => {
    const ring = new PlaybackOutcomeRing();
    expect(ring.castSeq).toBe(0);
    ring.beginCast();
    expect(ring.castSeq).toBe(ring.snapshot().castSeq);
  });

  it('keeps the newest ring-size entries and never resets seq when evicting', () => {
    const ring = new PlaybackOutcomeRing();
    for (let i = 0; i < PLAYBACK_OUTCOME_RING_SIZE + 5; i += 1) {
      ring.record(fail(`s${String(i)}`));
    }
    const { entries } = ring.snapshot();
    expect(entries).toHaveLength(PLAYBACK_OUTCOME_RING_SIZE);
    expect(entries[0].seq).toBe(6);
    expect(entries.at(-1)?.seq).toBe(PLAYBACK_OUTCOME_RING_SIZE + 5);
  });

  it('keeps an undrained entry identity stable across a new cast', () => {
    const ring = new PlaybackOutcomeRing();
    ring.beginCast();
    const first = ring.record(fail('a'));
    ring.beginCast();
    const { castSeq, entries } = ring.snapshot();
    expect(castSeq).toBe(2);
    expect(entries[0]).toMatchObject({ castSeq: 1, seq: first.seq });
  });

  it('does not drain on read: the same entries are visible to a second poll', () => {
    const ring = new PlaybackOutcomeRing();
    ring.record(fail('a'));
    const first = ring.snapshot();
    first.entries.pop();
    expect(ring.snapshot().entries).toHaveLength(1);
  });
});
