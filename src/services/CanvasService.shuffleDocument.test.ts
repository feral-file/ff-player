import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';
import { contentPolicyStore } from './ContentPolicyStore';
import DeviceManager from '@/utils/DeviceManager';
import { playItems } from '@/utils/playOrder';
import { DEFAULT_CONTENT_POLICY } from './contentPolicy';
import { CastCommand, type CastInfo } from '@/models';
import {
  DP1Action,
  DP1License,
  type DP1Call,
  type DP1Item,
} from '@/models/dp1.model';
import { dp1Document, fixtureId } from '@/testing/dp1Fixtures';

const item = (name: string): DP1Item => ({
  id: fixtureId(name),
  source: `https://art.test/${name}`,
  license: DP1License.Open,
});
const names = ['a', 'b', 'c', 'd'];
const document = (...items: string[]): DP1Call =>
  dp1Document({
    id: fixtureId('set'),
    items: (items.length ? items : names).map(item),
  });

const cast = (doc: DP1Call, action = DP1Action.NowDisplay) =>
  canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: { intent: { action }, dp1_call: structuredClone(doc) },
  });
const refresh = (doc: DP1Call) =>
  canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: structuredClone(doc),
      refresh: true,
    },
  });
const shuffle = (enabled: boolean) =>
  canvasService.processMessage({
    command: CastCommand.setShuffle,
    request: { enabled },
  });
const ids = (items: DP1Item[] | undefined) => items?.map(entry => entry.id);
const idsOf = (...items: string[]) => items.map(fixtureId);

/** What a restart does to a cast: storage round trip, then hydration. */
const restart = () => {
  const stored = JSON.stringify(canvasService.getCastInfo());
  canvasService.setCastInfo(null, false);
  canvasService.setCastInfo(JSON.parse(stored) as CastInfo, false);
};

beforeEach(async () => {
  vi.stubGlobal('window', { location: { pathname: '/playlist' } } as never);
  vi.spyOn(DeviceManager, 'getContentPolicyRecord').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'setContentPolicyRecord').mockResolvedValue(
    undefined
  );
  // Reverses the shuffled tail, so the order always changes.
  vi.spyOn(Math, 'random').mockReturnValue(0);
  await contentPolicyStore.initialize();
});
afterEach(async () => {
  canvasService.setCastInfo(null, false);
  await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shuffle and the signed document', () => {
  it('reports an unsigned playlist in play order and keeps the document', () => {
    cast(document());
    shuffle(true);

    const status = canvasService.getStatus();
    expect(status.playlist?.items).toEqual(status.items);
    expect(status.playlist).not.toHaveProperty('signatures');
    expect(canvasService.getCastInfo()?.playlist).toEqual(document());
    // Math.random() === 0 rotates the tail behind the current work.
    expect(ids(status.items)).toEqual(idsOf('a', 'c', 'd', 'b'));
    expect(status.index).toBe(0);
    expect(status.shuffle).toBe(true);
  });

  it('keeps the work on screen selected when shuffle goes off', () => {
    cast(document());
    canvasService.processMessage({
      command: CastCommand.moveToArtwork,
      request: { index: 2 },
    });
    shuffle(true);
    expect(canvasService.getStatus().items?.[0].id).toBe(fixtureId('c'));
    canvasService.processMessage({
      command: CastCommand.moveToArtwork,
      request: { index: 1 },
    });
    const onScreen = canvasService.getStatus().items?.[1].id;
    shuffle(false);

    const status = canvasService.getStatus();
    expect(status.items).toEqual(document().items);
    expect(status.items?.[status.index ?? 0].id).toBe(onScreen);
    expect(status.playlist).toEqual(document());
  });

  it('keeps the shuffled order over a restart, and still restores it', () => {
    cast(document());
    shuffle(true);
    restart();

    expect(ids(canvasService.getStatus().items)).toEqual(
      idsOf('a', 'c', 'd', 'b')
    );
    expect(canvasService.getCastInfo()?.playlist).toEqual(document());
    shuffle(false);
    restart();
    expect(canvasService.getStatus().items).toEqual(document().items);
    expect(canvasService.getStatus().playlist).toEqual(document());
  });
});

describe('a reported playlist sent back', () => {
  it('is unchanged content to a refresh', () => {
    cast(document());
    shuffle(true);
    const echoed = canvasService.getStatus().playlist ?? document();
    refresh(echoed);

    expect(canvasService.getCastInfo()?.playlist).toEqual(document());
    expect(canvasService.getStatus().playlist).toEqual(echoed);
    shuffle(false);
    expect(canvasService.getStatus().playlist).toEqual(document());
  });
});

describe('refresh, policy and boot record while shuffled', () => {
  it('keeps the order and an unsigned document when only defaults change', () => {
    cast(document());
    shuffle(true);
    refresh({ ...document(), defaults: { duration: 9 } });

    const status = canvasService.getStatus();
    const stored = canvasService.getCastInfo()?.playlist;
    expect(ids(stored?.items)).toEqual(idsOf(...names));
    expect(stored).not.toHaveProperty('signatures');
    expect(ids(status.items)).toEqual(idsOf('a', 'c', 'd', 'b'));
  });

  it('plays new items in their own order', () => {
    cast(document());
    shuffle(true);
    refresh(document('a', 'b', 'e'));

    expect(ids(canvasService.getStatus().items)).toEqual(idsOf('a', 'b', 'e'));
    expect(canvasService.getCastInfo()?.playOrder).toBeUndefined();
    expect(canvasService.getStatus().shuffle).toBe(true);
  });

  it('drops the old order when a deferred refresh is installed', () => {
    cast(document());
    shuffle(true);
    canvasService.clearQueuedPlaylistPending();
    refresh(document('d', 'c', 'b'));
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);
    // The same list re-sent while shuffled stays pending.
    refresh(document('d', 'c', 'b'));
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);
    expect(ids(canvasService.getQueuedPlaylistItems() ?? [])).toEqual(
      idsOf('d', 'c', 'b')
    );

    canvasService.consumeDeferredRefreshPlaylist(0);
    expect(ids(playItems(canvasService.getCastInfo()))).toEqual(
      idsOf('d', 'c', 'b')
    );
  });

  it('renumbers the order when policy removes a work', async () => {
    const mixed = dp1Document({
      items: names.map(name => ({
        ...item(name),
        ...(name === 'c' ? { contentRating: 'mature' } : {}),
      })),
    });
    await contentPolicyStore.set({
      ...DEFAULT_CONTENT_POLICY,
      showMatureContent: true,
    });
    cast(mixed);
    shuffle(true);
    await contentPolicyStore.set(DEFAULT_CONTENT_POLICY);

    const status = canvasService.getStatus();
    expect(ids(canvasService.getCastInfo()?.playlist?.items)).toEqual(
      idsOf('a', 'b', 'd')
    );
    expect(status.playlist).not.toHaveProperty('signatures');
    expect(ids(status.items)).toEqual(idsOf('a', 'd', 'b'));
    expect(status.index).toBe(0);
  });

  it('writes the boot record in document order', async () => {
    const written = vi
      .spyOn(DeviceManager, 'setBootPlaylist')
      .mockResolvedValue(undefined);
    let record: DP1Call = document();
    written.mockImplementation(next => {
      record = next;
      return Promise.resolve();
    });
    vi.spyOn(DeviceManager, 'getBootPlaylist').mockImplementation(() =>
      Promise.resolve(record)
    );
    cast(document(), DP1Action.DisplayAtBoot);
    shuffle(true);
    refresh({ ...document(), defaults: { duration: 9 } });
    await vi.waitFor(() => {
      expect(record.defaults).toEqual({ duration: 9 });
    });

    expect(ids(record.items)).toEqual(idsOf(...names));
  });
});

describe('a stored cast an older build shuffled', () => {
  it('is reported without the signature it can no longer carry', () => {
    const stored: CastInfo = {
      castCommand: CastCommand.displayPlaylist,
      playlist: { ...document('b', 'a'), id: fixtureId('set') },
      index: 0,
      shuffle: true,
    };
    vi.spyOn(DeviceManager, 'getCachedCastInfo').mockReturnValue(stored);

    const status = canvasService.getStatus();
    expect(ids(status.items)).toEqual(idsOf('b', 'a'));
    expect(status.playlist).not.toHaveProperty('signatures');
  });
});
