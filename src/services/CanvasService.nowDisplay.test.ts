import { RenderStatus, CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (
  id: string,
  items: DP1Item[],
  playlistDefaults?: DP1Call['defaults']
): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  defaults: playlistDefaults,
  items,
});

beforeEach(() => {
  vi.stubGlobal('window', {
    location: { pathname: '/playlist' },
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  canvasService.setCastInfo(null, false);
});

it('resets loop and shuffle when a fresh Now Display playlist is applied', () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('old', ['A'].map(item)),
      index: 0,
      shuffle: true,
      loopMode: LoopMode.none,
    },
    false
  );

  const reply = canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist('new', ['B', 'C'].map(item)),
    },
  });

  expect(reply).toEqual({ ok: true });
  const next = canvasService.getCastInfo();
  expect(next?.shuffle).toBe(false);
  expect(next?.loopMode).toBe(LoopMode.playlist);
  expect(next?.playlist?.items?.map(entry => entry.id)).toEqual(['B', 'C']);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
});

it('preserves render status in cast info and status replies', () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('active', ['A'].map(item)),
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  expect(canvasService.getCastInfo()?.renderStatus).toBe(RenderStatus.ready);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);

  canvasService.setRenderStatus(RenderStatus.loading);

  expect(canvasService.getCastInfo()?.renderStatus).toBe(RenderStatus.loading);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.loading);
});

it('returns ok:false when a playlist item source uses an unsupported URL', () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('old', ['A'].map(item)),
      index: 0,
    },
    false
  );

  const reply = canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist('new', [
        {
          id: 'bad-1',
          title: 'Broken Source',
          source: 'invalid://source',
          license: {},
        } as DP1Item,
      ]),
    },
  });

  expect(reply).toEqual({ ok: false });
  expect(canvasService.getCastInfo()?.castCommand).toBe(
    CastCommand.displayPlaylist
  );
  expect(
    canvasService.getCastInfo()?.playlist?.items?.map(entry => entry.id)
  ).toEqual(['A']);
  expect(canvasService.getStatus().renderStatus).toBeUndefined();
});

it('accepts relative and protocol-relative sources on Now Display', () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('old', ['A'].map(item)),
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  const relativeReply = canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist('relative', [
        {
          id: 'relative-1',
          title: 'Relative Source',
          source: 'artwork.jpg',
          license: {},
        } as DP1Item,
      ]),
    },
  });

  expect(relativeReply).toEqual({ ok: true });
  expect(canvasService.getCastInfo()?.playlist?.items?.[0]?.source).toBe(
    'artwork.jpg'
  );
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);

  const protocolRelativeReply = canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist('protocol-relative', [
        {
          id: 'protocol-1',
          title: 'Protocol Relative Source',
          source: '//cdn.example.com/artwork.jpg',
          license: {},
        } as DP1Item,
      ]),
    },
  });

  expect(protocolRelativeReply).toEqual({ ok: true });
  expect(canvasService.getCastInfo()?.playlist?.items?.[0]?.source).toBe(
    '//cdn.example.com/artwork.jpg'
  );
});

it('keeps ready when Now Display re-casts the artwork already on screen', () => {
  const active = playlist('active', ['A', 'B'].map(item));
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: active,
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  const reply = canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: active,
    },
  });

  // ArtworkPlayer only re-publishes when previewURL/itemIdentity change, so a
  // forced pending here would never be answered and the poll would report
  // pending for an artwork that is visibly rendered.
  expect(reply).toEqual({ ok: true });
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
});

it('resets render status to pending when Now Display selects a different artwork', () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('active', ['A', 'B'].map(item)),
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  const reply = canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: playlist('next', ['C'].map(item)),
    },
  });

  expect(reply).toEqual({ ok: true });
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
});

it('resets render status to pending on moveToArtwork', () => {
  const active = playlist('active', ['A', 'B'].map(item));
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: active,
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  const reply = canvasService.processMessage({
    command: CastCommand.moveToArtwork,
    request: { index: 1 },
  });

  expect(reply).toEqual({ ok: true });
  expect(canvasService.getCastInfo()?.index).toBe(1);
  expect(canvasService.getCastInfo()?.renderStatus).toBe(RenderStatus.pending);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
});

it('resets render status to pending on updateIndex when the selected item changes', () => {
  const active = playlist('active', ['A', 'B'].map(item));
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: active,
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  // playlist-client publishCurrentIndex spreads the prior castInfo, which still
  // carries ready — setCastInfo must not keep that across the new item.
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.updateIndex,
      playlist: active,
      index: 1,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  expect(canvasService.getCastInfo()?.renderStatus).toBe(RenderStatus.pending);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
});

it('resets render status when a deferred playlist promotion selects a new item', () => {
  const previous = playlist('old', ['A'].map(item));
  const deferred = playlist('new', ['B', 'C'].map(item));
  const service = canvasService as unknown as {
    deferredRefreshPlaylist: DP1Call | null;
    queuedPlaylistPending: boolean;
  };

  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: previous,
      index: 0,
      renderStatus: RenderStatus.failed,
    },
    false
  );
  service.deferredRefreshPlaylist = deferred;
  service.queuedPlaylistPending = true;

  expect(canvasService.consumeDeferredRefreshPlaylist(0)?.id).toBe('new');
  expect(canvasService.getCastInfo()?.playlist?.id).toBe('new');
  expect(canvasService.getCastInfo()?.renderStatus).toBe(RenderStatus.pending);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
});

it('preserves render status when cast info updates without changing artwork', () => {
  const active = playlist('active', ['A', 'B'].map(item));
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: active,
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  canvasService.setCastInfo(
    {
      castCommand: CastCommand.setLoop,
      playlist: active,
      index: 0,
      loopMode: LoopMode.one,
      renderStatus: RenderStatus.ready,
    },
    false
  );

  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.ready);
});

it('resets render status to pending when refresh replaces source for the same item id', () => {
  const service = canvasService as unknown as {
    refreshPlaylist(newItems: DP1Item[] | undefined): { ok: boolean };
  };
  const previousItem = {
    ...item('A'),
    source: 'https://example.com/old.jpg',
  } as DP1Item;
  const refreshedItem = {
    ...item('A'),
    source: 'https://example.com/new.jpg',
  } as DP1Item;

  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('active', [previousItem]),
      index: 0,
      renderStatus: RenderStatus.ready,
    },
    false
  );
  canvasService.setRenderStatus(RenderStatus.ready);

  expect(service.refreshPlaylist([refreshedItem])).toEqual({ ok: true });
  expect(canvasService.getCastInfo()?.playlist?.items?.[0]?.source).toBe(
    'https://example.com/new.jpg'
  );
  expect(canvasService.getCastInfo()?.renderStatus).toBe(RenderStatus.pending);
  expect(canvasService.getStatus().renderStatus).toBe(RenderStatus.pending);
});

it('does not report persisted ready after cast info recovery hydrate', async () => {
  const DeviceManager = (await import('@/utils/DeviceManager')).default;
  const getCachedCastInfo = vi
    .spyOn(DeviceManager, 'getCachedCastInfo')
    .mockReturnValue({
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('recovered', ['A'].map(item)),
      index: 0,
      renderStatus: RenderStatus.ready,
    });

  canvasService.setCastInfo(null, false);

  expect(canvasService.getStatus().renderStatus).toBeUndefined();
  expect(canvasService.getCastInfo()?.renderStatus).toBeUndefined();
  expect(canvasService.getCastInfo()?.playlist?.id).toBe('recovered');

  getCachedCastInfo.mockRestore();
});
