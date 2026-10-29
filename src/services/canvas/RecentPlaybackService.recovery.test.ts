import {
  beforeEach,
  afterEach,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { DP1Item, DP1License } from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { RECENTLY_PLAYED_MAX_RECORD_BYTES } from '../recentPlaybackHistory';
import { RecentPlaybackService } from './RecentPlaybackService';

const work: DP1Item = {
  id: 'a',
  source: 'https://art.test/a',
  license: DP1License.Open,
};
let history: RecentPlaybackService;
let writeHistory: MockInstance<typeof DeviceManager.setRecentlyPlayed>;
const active = () =>
  history
    .getRecentlyPlayed()
    .records?.filter(record => (record as { isActive: boolean }).isActive);

beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getRecentlyPlayed').mockResolvedValue([]);
  vi.spyOn(DeviceManager, 'getRecentlyPlayedIncomplete').mockResolvedValue(
    false
  );
  writeHistory = vi
    .spyOn(DeviceManager, 'setRecentlyPlayed')
    .mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'setRecentlyPlayedIncomplete').mockResolvedValue(
    undefined
  );
  history = new RecentPlaybackService();
  await history.primeRecentlyPlayed();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Drain queued storage promises without changing the playback clock. */
async function settle() {
  for (let step = 0; step < 20; step++) {
    await Promise.resolve();
  }
}

it('restores the same durable occurrence without changing its record or timestamp', async () => {
  const recover = history.recordRecentlyPlayed(work);
  await settle();
  const before = history.getRecentlyPlayed();
  expect(history.currentItem).toEqual(work);
  history.markRenderFailed();
  expect(history.currentItem).toBeNull();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(false);
  expect(active()).toEqual([]);
  recover();
  expect(history.getRecentlyPlayed()).toEqual(before);
  expect(history.currentItem).toEqual(work);
  expect(writeHistory).toHaveBeenCalledTimes(1);
});

it('keeps a write that finishes during failure hidden until the renderer recovers', async () => {
  let finish: () => void = () => undefined;
  writeHistory.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  const recover = history.recordRecentlyPlayed(work);
  await settle();
  history.markRenderFailed();
  finish();
  await settle();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(false);
  expect(active()).toEqual([]);
  recover();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(true);
  expect(active()).toHaveLength(1);
});

it('waits for durability when the renderer recovers before the write finishes', async () => {
  let finish: () => void = () => undefined;
  writeHistory.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  const recover = history.recordRecentlyPlayed(work);
  await settle();
  history.markRenderFailed();
  recover();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(false);
  finish();
  await settle();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(true);
  expect(active()).toHaveLength(1);
});

it('invalidates a recovery receipt on stop even when its durable write is outstanding', async () => {
  let finish: () => void = () => undefined;
  writeHistory.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  const recover = history.recordRecentlyPlayed(work);
  await settle();
  history.markRenderFailed();
  history.retireActiveRecentlyPlayed();
  finish();
  await settle();
  recover();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(true);
  expect(active()).toEqual([]);
});

it('rejects a receipt from an earlier showing of the identical work', async () => {
  const oldReceipt = history.recordRecentlyPlayed(work);
  const currentReceipt = history.recordRecentlyPlayed(work);
  await settle();
  history.markRenderFailed();
  oldReceipt();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(false);
  expect(active()).toEqual([]);
  currentReceipt();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(true);
  expect(active()).toHaveLength(1);
  expect(history.getRecentlyPlayed().records).toHaveLength(2);
});

it('restores a known empty active occurrence when the work exceeds history retention', async () => {
  const recover = history.recordRecentlyPlayed({
    ...work,
    source: 'data:text/html,' + 'a'.repeat(RECENTLY_PLAYED_MAX_RECORD_BYTES),
  });
  await settle();
  history.markRenderFailed();
  expect(history.getRecentlyPlayed().activeOccurrenceKnown).toBe(false);
  recover();
  expect(history.getRecentlyPlayed()).toMatchObject({
    activeOccurrenceKnown: true,
    incomplete: true,
    records: [],
  });
});
