import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import { RECENTLY_PLAYED_MAX_RECORD_BYTES } from './recentPlaybackHistory';
import DeviceManager from '@/utils/DeviceManager';
import { CastCommand } from '@/models';
import { DP1Item, DP1License } from '@/models/dp1.model';

const item = (id: string): DP1Item => ({
  id, source: `https://art.test/${id}`, license: DP1License.Open,
});

const history = () => canvasService.processMessage({
  command: CastCommand.getRecentlyPlayed,
  request: {},
}) as { ok: boolean; status?: string; records?: { recordId: string; isActive?: boolean }[];
  incomplete?: boolean; activeOccurrenceKnown?: boolean };

/** Lets a test resolve the queued durable write at a moment of its choosing. */
let releaseWrite: (() => void) | null = null;

beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'getRecentlyPlayed').mockResolvedValue([]);
  vi.spyOn(DeviceManager, 'getRecentlyPlayedIncomplete').mockResolvedValue(false);
  vi.spyOn(DeviceManager, 'setRecentlyPlayed').mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'setRecentlyPlayedIncomplete').mockResolvedValue(undefined);
  releaseWrite = null;
  await contentPolicyStore.initialize();
  // Settle the lazy history load so the first getRecentlyPlayed in a test is
  // an answer about history rather than the still-loading reply.
  canvasService.recordRecentlyPlayed(item('warmup'));
  await vi.waitFor(() => { expect(history().ok).toBe(true); });
  canvasService.setCastInfo(null, false);
});

afterEach(async () => {
  canvasService.setCastInfo(null, false);
  await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);
  vi.restoreAllMocks();
});

describe('recently played active occurrence follows the wall', () => {
  it('reports the committed work as the active occurrence', async () => {
    canvasService.recordRecentlyPlayed(item('a'));

    await vi.waitFor(() => {
      expect(history().activeOccurrenceKnown).toBe(true);
    });
    expect(history().records?.some(record => record.isActive)).toBe(true);
  });

  it('stops claiming an active occurrence once playback is cleared', async () => {
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    canvasService.setCastInfo(null, false);

    // The record is retained — history is a timeline — but nothing is on the
    // wall, so no occurrence may be marked active.
    expect(history().activeOccurrenceKnown).toBe(false);
    expect(history().records?.some(record => record.isActive)).toBe(false);
    expect(history().records?.length).toBeGreaterThan(0);
  });

  it('does not mark a work active once a newer work has begun committing', async () => {
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });
    const firstActive = history().records?.find(record => record.isActive)?.recordId;

    canvasService.recordRecentlyPlayed(item('b'));

    // Between the new commit and its durable write the honest answer is
    // "not known yet", never the work that has already left the wall.
    expect(history().activeOccurrenceKnown).toBe(false);
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });
    expect(history().records?.find(record => record.isActive)?.recordId).not.toBe(firstActive);
  });

  it('cannot let a write that lands after a stop resurrect an active occurrence', async () => {
    const gate = new Promise<void>(resolve => { releaseWrite = resolve; });
    vi.mocked(DeviceManager.setRecentlyPlayed).mockImplementationOnce(async () => gate);

    canvasService.recordRecentlyPlayed(item('a'));
    canvasService.setCastInfo(null, false);
    releaseWrite?.();
    await vi.waitFor(() => {
      expect(vi.mocked(DeviceManager.setRecentlyPlayed)).toHaveBeenCalled();
    });

    expect(history().activeOccurrenceKnown).toBe(false);
  });

  it('leaves no stale active occurrence when an oversize record is omitted', async () => {
    canvasService.recordRecentlyPlayed(item('a'));
    await vi.waitFor(() => { expect(history().activeOccurrenceKnown).toBe(true); });

    const oversize: DP1Item = {
      ...item('huge'),
      source: `data:text/html,${'x'.repeat(RECENTLY_PLAYED_MAX_RECORD_BYTES)}`,
    };
    canvasService.recordRecentlyPlayed(oversize);

    await vi.waitFor(() => { expect(history().incomplete).toBe(true); });
    // The omitted work is the one on the wall. Reporting the previous record
    // as active would name the wrong work.
    expect(history().activeOccurrenceKnown).toBe(false);
  });
});
