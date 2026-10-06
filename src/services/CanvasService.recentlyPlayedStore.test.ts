/**
 * The History store's failure modes. Kept in its own file because these need a
 * CanvasService whose history has never loaded: the service is a singleton, so
 * a suite that primes it cannot then observe a first read that fails.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';
import { type RecentlyPlayedRecord } from './recentPlaybackHistory';
import DeviceManager from '@/utils/DeviceManager';
import { CastCommand } from '@/models';
import { DP1Item, DP1License } from '@/models/dp1.model';

const item = (id: string): DP1Item => ({
  id, source: `https://art.test/${id}`, license: DP1License.Open,
});

const history = () => canvasService.processMessage({
  command: CastCommand.getRecentlyPlayed,
  request: {},
}) as { ok: boolean; status?: string; records?: unknown[];
  incomplete?: boolean; activeOccurrenceKnown?: boolean };

let setRecentlyPlayed: MockInstance<(records: RecentlyPlayedRecord[]) => Promise<void>>;

beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'getRecentlyPlayed')
    .mockRejectedValue(new Error('Invalid recently played history'));
  vi.spyOn(DeviceManager, 'getRecentlyPlayedIncomplete').mockResolvedValue(false);
  setRecentlyPlayed = vi.spyOn(DeviceManager, 'setRecentlyPlayed').mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'setRecentlyPlayedIncomplete').mockResolvedValue(undefined);
  await contentPolicyStore.initialize();
});

describe('recently played when its store cannot be read', () => {
  it('answers with an empty, explicitly incomplete history instead of an error', async () => {
    await canvasService.primeRecentlyPlayed();

    // A corrupt or unreadable store is a gap in the timeline, not a reason to
    // refuse History for the life of the page. The next append overwrites it.
    const reply = history();
    expect(reply.ok).toBe(true);
    expect(reply.status).toBe('empty');
    expect(reply.records).toEqual([]);
    expect(reply.incomplete).toBe(true);
  });

  it('records a new work over the unreadable store, still marked incomplete', async () => {
    await canvasService.primeRecentlyPlayed();

    canvasService.recordRecentlyPlayed(item('after'));

    await vi.waitFor(() => { expect(history().records?.length).toBe(1); });
    expect(history().incomplete).toBe(true);
    expect(setRecentlyPlayed).toHaveBeenCalled();
  });

  it('has history ready for the first request after boot', async () => {
    // Priming at boot is what keeps the app's first read from being told the
    // store is still loading, which it had no way to tell apart from an error.
    await canvasService.primeRecentlyPlayed();

    expect(history().ok).toBe(true);
  });
});

