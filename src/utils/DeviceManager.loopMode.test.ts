/**
 * Repeat is kept on the device: what setLoop stores is what a later page load
 * reads back.
 */
import { LocalStorageItem } from '@/constants';
import { LoopMode } from '@/models/cast_info.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from './DeviceManager';
import indexedDBStorage from './IndexedDBStorage';

interface DeviceManagerInternals {
  cache: Map<string, string | null>;
  initPromise: Promise<void> | null;
  initialized: boolean;
}

const internals = () => DeviceManager as unknown as DeviceManagerInternals;
const loopKey: string = LocalStorageItem.loopMode;

/** A page load: nothing cached, storage not yet read. */
function restart() {
  const s = internals();
  s.initialized = false;
  s.initPromise = null;
  s.cache.delete(loopKey);
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

describe('Repeat kept on the device', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(indexedDBStorage, 'setItem').mockResolvedValue(undefined);
    await DeviceManager.setLoopMode(LoopMode.playlist).catch(() => undefined);
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
});
