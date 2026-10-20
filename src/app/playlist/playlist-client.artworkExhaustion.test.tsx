/**
 * Regression for the feralfile-bot review of feral-file/ff-player#307's fix
 * (PR #310, finding F1, Major): when `onArtworkExhausted` fires and the
 * consumer replays the SAME item instead of moving to a different one —
 * `LoopMode.one`, or a single-item playlist wrapping to itself —
 * ArtworkPlayer's failure counter was never reset. The very next failure on
 * that replay found the counter already at the limit and re-exhausted
 * immediately, with none of the ARTWORK_FAILURE_RETRY_DELAY_MS pacing: an
 * unbounded reload loop, defeating the retry-then-skip budget the branch
 * exists to add (and the exact runaway-reload shape the original issue
 * reported, just relocated to the same-item replay path).
 *
 * Unlike playlist-client.sourceEnd.test.tsx, this file does NOT mock
 * ArtworkPlayer — the defect lives inside ArtworkPlayer's own failure
 * counter, reached only through the real onArtworkExhausted -> advanceFromSlot
 * -> replayCurrentSlot -> performArtworkReload loop, so a mocked
 * ArtworkPlayer would not reproduce it.
 */
import { LoopMode } from '@/models/cast_info.model';
import { canvasService } from '@/services/CanvasService';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareContentPolicy } from '@/services/contentPolicy.testkit';

beforeEach(prepareContentPolicy);

import {
  displayCast,
  item,
  PlaylistHarness,
  teardownPlaylistWiringTest,
} from './playlist-client.testkit';

const loaderState = vi.hoisted(() => ({ attemptTimestamps: [] as number[] }));

vi.mock('@/utils/mediaLoader', async importOriginal => {
  const mod = await importOriginal<typeof import('@/utils/mediaLoader')>();
  return {
    ...mod,
    createMediaLoader: () => ({
      // Every attempt fails immediately — the item never recovers on its
      // own, so pacing between attempts is the only thing standing between
      // this and a tight reload loop.
      loadMedia: (options: { onError?: (error: Error) => void }) => {
        loaderState.attemptTimestamps.push(Date.now());
        options.onError?.(new Error('load failed'));
        return undefined;
      },
      cleanup: () => undefined,
    }),
  };
});

// A HEAD probe that never resolves usefully — the extensionless-URL branch
// isn't exercised here (item() URLs end in .jpg, so extension inference
// resolves the type without needing network corroboration either way); this
// just keeps the probe itself from hanging real test time.
vi.stubGlobal(
  'fetch',
  vi.fn().mockRejectedValue(new Error('network unavailable in test'))
);

/**
 * A fresh cycle's first attempt, forced by the same-item replay right after
 * exhaustion, is EXPECTED to land immediately (near-zero gap) — exhaustion
 * itself is deliberately not throttled, only retries within a budget are.
 * The regression this guards against is a BURST: two or more near-zero gaps
 * back to back, which means exhaustion re-fired before a single paced retry
 * ran in between — the bug's "attempts four onward only 1ms apart" shape.
 * So: every near-zero gap must be isolated, never adjacent to another one.
 */
function assertNoBurst(timestamps: number[], minPacedGapMs: number) {
  expect(timestamps.length).toBeGreaterThanOrEqual(6);
  const nearZero = (gap: number) => gap < 500;
  const gaps = timestamps.slice(1).map((t, i) => t - timestamps[i]);
  for (let i = 1; i < gaps.length; i++) {
    if (nearZero(gaps[i])) {
      expect(nearZero(gaps[i - 1])).toBe(false);
    } else {
      expect(gaps[i]).toBeGreaterThanOrEqual(minPacedGapMs);
    }
  }
}

/** Advancing one large chunk does not reliably interleave the microtask
 * flushing a chained retry -> async content-type detection -> next retry
 * cycle needs; step in retry-sized increments instead, matching the pattern
 * already proven in ArtworkPlayer.failureRetrySkip.test.tsx. */
async function advanceInSteps(totalMs: number, stepMs: number) {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(stepMs, remaining);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(step);
    });
    remaining -= step;
  }
}

afterEach(() => {
  teardownPlaylistWiringTest();
  loaderState.attemptTimestamps = [];
  vi.restoreAllMocks();
});

describe('PlaylistClient + ArtworkPlayer — same-item exhaustion replay stays paced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('paces retries after exhaustion in LoopMode.one instead of bursting', async () => {
    const items = [item('stuck', 300), item('other', 300)];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.one), false);
    render(<PlaylistHarness castInfo={displayCast(items, 0, LoopMode.one)} />);

    // Two full retry-then-exhaust cycles (3 attempts each, 3s apart) plus a
    // little slack — enough to show the second cycle starts paced too, not
    // bursting the moment the first one's forced same-item reload lands.
    await advanceInSteps(19000, 500);

    assertNoBurst(loaderState.attemptTimestamps, 2900);
    // Still pinned on the same (only ever) item — LoopMode.one never skips.
    expect(canvasService.getCastInfo()?.index).toBe(0);
  });

  it('paces retries after exhaustion in a single-item playlist instead of bursting', async () => {
    const items = [item('stuck', 300)];
    canvasService.setCastInfo(
      displayCast(items, 0, LoopMode.playlist),
      false
    );
    render(
      <PlaylistHarness castInfo={displayCast(items, 0, LoopMode.playlist)} />
    );

    await advanceInSteps(19000, 500);

    assertNoBurst(loaderState.attemptTimestamps, 2900);
    expect(canvasService.getCastInfo()?.index).toBe(0);
  });

  /**
   * Regression for run-reviewer pass 4, F2: LoopMode.none at the final (or
   * only) slot has nowhere for advanceFromSlot to skip to
   * (resolveSequentialPlaylistAdvance returns null), so reusing the plain
   * hold-the-last-frame branch for an exhausted FAILURE — rather than a
   * successful natural end — would park the device on the error modal
   * forever with no further attempt. handleArtworkExhausted must retry in
   * place here instead, same budget, same pacing.
   */
  it('keeps retrying in place after exhaustion in LoopMode.none at the final item, instead of holding forever', async () => {
    const items = [item('stuck', 300)];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.none), false);
    render(
      <PlaylistHarness castInfo={displayCast(items, 0, LoopMode.none)} />
    );

    await advanceInSteps(19000, 500);

    assertNoBurst(loaderState.attemptTimestamps, 2900);
    // Nothing to skip to under LoopMode.none with a single item — stays put.
    expect(canvasService.getCastInfo()?.index).toBe(0);
  });

  /**
   * Regression for run-reviewer bot-round-2 F2: the single-item test above
   * cannot distinguish the correct guard (`fromIndex === snapshot.length - 1`)
   * from a plausible wrong one (e.g. `fromIndex === 0`), since index 0 is
   * simultaneously "first" and "last" in a length-1 playlist. A multi-item
   * playlist, failing on the LAST (not only) item under LoopMode.none, is
   * the one case that actually proves `advanceFromSlot`'s `retryOnFinalHold`
   * branch — not a wrap-to-0 — is what fires.
   */
  it('keeps retrying in place on the last item of a multi-item LoopMode.none playlist, instead of wrapping to the first', async () => {
    const items = [item('first', 300), item('stuck', 300)];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.none), false);
    render(
      <PlaylistHarness castInfo={displayCast(items, 1, LoopMode.none)} />
    );

    await advanceInSteps(19000, 500);

    assertNoBurst(loaderState.attemptTimestamps, 2900);
    // Must stay on the last item — a wrap-to-0 bug would move this to 0.
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });
});
