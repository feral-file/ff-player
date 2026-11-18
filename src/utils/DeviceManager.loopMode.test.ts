/**
 * Repeat is kept on the device: what setLoop stores is what a later page load
 * reads back, and a Now Display accepted before storage has answered takes
 * the stored mode once it has.
 */
import { LocalStorageItem } from '@/constants';
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from './DeviceManager';
import indexedDBStorage from './IndexedDBStorage';

interface DeviceManagerInternals {
  cache: Map<string, string | null>;
  initPromise: Promise<void> | null;
  initialized: boolean;
  chosenLoopMode: LoopMode | null;
}

const internals = () => DeviceManager as unknown as DeviceManagerInternals;
const loopKey: string = LocalStorageItem.loopMode;

/** A page load: nothing cached, storage not yet read. */
function restart() {
  const s = internals();
  s.initialized = false;
  s.initPromise = null;
  s.cache.delete(loopKey);
  s.chosenLoopMode = null;
}

/** Storage holding `stored` for Repeat, answering when the returned function is called. */
function gatedStorage(stored: string | null) {
  let release: (() => void) | undefined;
  const gate = new Promise<string | null>(resolve => {
    release = () => {
      resolve(stored);
    };
  });
  vi.spyOn(indexedDBStorage, 'getItem').mockImplementation(
    async (key: string) => (key === loopKey ? gate : null)
  );
  vi.spyOn(indexedDBStorage, 'setItem').mockResolvedValue(undefined);
  return () => release?.();
}

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const display = (id: string) =>
  canvasService.processMessage({
    command: CastCommand.displayPlaylist,
    request: {
      intent: { action: DP1Action.NowDisplay },
      dp1_call: {
        dpVersion: '1',
        id,
        title: id,
        items: ['A', 'B'].map(item),
      } as DP1Call,
    },
  });

describe('Repeat kept on the device', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/playlist' } } as never);
  });

  afterEach(async () => {
    canvasService.setCastInfo(null, false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(indexedDBStorage, 'setItem').mockResolvedValue(undefined);
    await DeviceManager.setLoopMode(LoopMode.playlist).catch(() => undefined);
    internals().chosenLoopMode = null;
    vi.restoreAllMocks();
  });

  it('writes the mode to storage and reads it back after a restart', async () => {
    const setItem = vi
      .spyOn(indexedDBStorage, 'setItem')
      .mockResolvedValue(undefined);
    vi.spyOn(indexedDBStorage, 'getItem').mockResolvedValue(null);
    await DeviceManager.setLoopMode(LoopMode.one);
    expect(setItem).toHaveBeenCalledWith(loopKey, LoopMode.one);

    restart();
    const release = gatedStorage(LoopMode.one);
    release();
    expect(await DeviceManager.getLoopMode()).toBe(LoopMode.one);
    expect(DeviceManager.getCachedLoopMode()).toBe(LoopMode.one);
  });

  it('reads playlist when nothing, or an unknown mode, is stored', async () => {
    restart();
    gatedStorage('sideways')();
    expect(await DeviceManager.getLoopMode()).toBe(LoopMode.playlist);
  });

  it('gives a Display accepted before storage answered the stored mode', async () => {
    restart();
    const release = gatedStorage(LoopMode.one);
    const initialize = DeviceManager.initialize();

    expect(display('early')).toEqual({ ok: true });
    expect(canvasService.getCastInfo()?.loopMode).toBe(LoopMode.playlist);

    release();
    await initialize;
    await vi.waitFor(() => {
      expect(canvasService.getCastInfo()?.loopMode).toBe(LoopMode.one);
    });
    expect(canvasService.getCastInfo()?.playlistId).toBe('early');
  });

  it('keeps a Repeat set while storage was still being read', async () => {
    restart();
    const release = gatedStorage(LoopMode.one);
    const initialize = DeviceManager.initialize();

    expect(display('early')).toEqual({ ok: true });
    canvasService.processMessage({
      command: CastCommand.setLoop,
      request: { mode: LoopMode.none },
    });

    release();
    await initialize;
    expect(await DeviceManager.getLoopMode()).toBe(LoopMode.none);
    await Promise.resolve();
    expect(canvasService.getCastInfo()?.loopMode).toBe(LoopMode.none);
  });
});
