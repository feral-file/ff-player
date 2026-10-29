import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CastCommand, RenderStatus } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { DP1Action, DP1Call, DP1Item, DP1License } from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';

const works: DP1Item[] = ['a', 'b'].map(id => ({
  id,
  source: `https://art.test/${id}`,
  license: DP1License.Open,
  contentRating: 'general',
}));
const playlist = (items: DP1Item[]): DP1Call => ({
  dpVersion: '1.1.0',
  id: 'list',
  title: 'Set',
  items,
});
const cast = (items: DP1Item[], refresh = false) =>
  canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist(items),
      refresh,
    },
  });

beforeEach(async () => {
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'getRecentlyPlayed').mockResolvedValue([]);
  vi.spyOn(DeviceManager, 'getRecentlyPlayedIncomplete').mockResolvedValue(
    false
  );
  vi.spyOn(DeviceManager, 'setRecentlyPlayed').mockResolvedValue(undefined);
  vi.spyOn(DeviceManager, 'setRecentlyPlayedIncomplete').mockResolvedValue(
    undefined
  );
  await contentPolicyStore.initialize();
  await canvasService.primeRecentlyPlayed();
});
afterEach(() => {
  canvasService.setCastInfo(null, false);
  vi.restoreAllMocks();
});

it('does not retire a failing incoming work when refresh blocks only its retired predecessor', async () => {
  expect(cast(works)?.ok).toBe(true);
  canvasService.recordRecentlyPlayed(works[0]);
  for (let step = 0; step < 20; step++) {
    await Promise.resolve();
  }
  canvasService.setCastInfo(
    {
      ...canvasService.getCastInfo(),
      index: 1,
      loopMode: LoopMode.one,
      shuffle: true,
    },
    false
  );
  // B fails and replaces outgoing A. A's retained receipt is no longer proof
  // of a visible work, so relabelling A cannot restart B's cast or its toggles.
  canvasService.setRenderStatus(RenderStatus.failed);
  const retirement = contentPolicyStore.getSnapshot().retireEpoch;
  expect(
    cast([{ ...works[0], contentRating: 'mature' }, works[1]], true)?.ok
  ).toBe(true);
  expect(contentPolicyStore.getSnapshot().retireEpoch).toBe(retirement);
  expect(canvasService.getCastInfo()).toMatchObject({
    castCommand: CastCommand.refreshPlaylist,
    loopMode: LoopMode.one,
    shuffle: true,
  });
  expect(
    canvasService.processMessage({ command: CastCommand.getRecentlyPlayed })
  ).toMatchObject({
    activeOccurrenceKnown: false,
  });
});
