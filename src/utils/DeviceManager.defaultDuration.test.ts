/**
 * Regression coverage for the default-item-duration setter racing the
 * DeviceManager startup preload: a preload read that was in flight when the
 * setter wrote its synchronous cache entry resolves later with the stale
 * stored value, and must not clobber the session's new value.
 */
import { LocalStorageItem } from '@/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from './DeviceManager';
import indexedDBStorage from './IndexedDBStorage';

interface DeviceManagerInternals {
  cache: Map<string, string | null>;
  initPromise: Promise<void> | null;
  initialized: boolean;
}

/** Typed access to DeviceManager private state for race setup. */
function internals(): DeviceManagerInternals {
  return DeviceManager as unknown as DeviceManagerInternals;
}

describe('DeviceManager.setDefaultItemDurationSeconds preload race', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await DeviceManager.setDefaultItemDurationSeconds(null);
  });

  it('keeps the command value when an in-flight preload read resolves late', async () => {
    // Force a fresh initialization whose IndexedDB read resolves only after
    // the setter has written its synchronous cache entry.
    const s = internals();
    s.initialized = false;
    s.initPromise = null;
    s.cache.delete(LocalStorageItem.defaultItemDuration);

    let releasePreload: ((value: string | null) => void) | undefined;
    const gate = new Promise<string | null>(resolve => {
      releasePreload = resolve;
    });
    const durationKey: string = LocalStorageItem.defaultItemDuration;
    vi.spyOn(indexedDBStorage, 'getItem').mockImplementation(
      async (key: string) => {
        if (key === durationKey) {
          return gate;
        }
        return null;
      }
    );
    vi.spyOn(indexedDBStorage, 'setItem').mockResolvedValue(undefined);

    const initialize = DeviceManager.initialize();
    const write = DeviceManager.setDefaultItemDurationSeconds(600);

    // The preload read for this key resolves after the setter's synchronous
    // cache write — the historical clobber scenario.
    releasePreload?.('300');
    await initialize;
    await write;

    expect(DeviceManager.getCachedDefaultItemDurationSeconds()).toBe(600);
  });
});
