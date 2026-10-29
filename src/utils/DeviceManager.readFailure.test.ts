/**
 * A read that FAILED and a key that is ABSENT are not the same answer. The
 * preload caches every persisted key at boot, so collapsing the two would make
 * a single unreadable moment look like a device with no saved state — for the
 * rest of the page's life.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from './DeviceManager';
import indexedDBStorage from './IndexedDBStorage';

interface Internals { cache: Map<string, string | null>; initialized: boolean }
const internals = () => DeviceManager as unknown as Internals;

beforeEach(() => {
  vi.restoreAllMocks();
  internals().cache.clear();
  internals().initialized = true;
});

describe('a read that could not reach storage', () => {
  it('is not cached as an absent value', async () => {
    const read = vi.spyOn(indexedDBStorage, 'getItem').mockResolvedValue(null);
    vi.spyOn(indexedDBStorage, 'reflectsRealAbsence').mockReturnValue(false);

    expect(await DeviceManager.getItem('castInfo')).toBeNull();
    expect(await DeviceManager.getItem('castInfo')).toBeNull();

    // Caching the first null would skip boot recovery for the page lifetime,
    // replacing restored playback with fallback content.
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('recovers the real value once storage answers', async () => {
    const read = vi.spyOn(indexedDBStorage, 'getItem').mockResolvedValue(null);
    const usable = vi.spyOn(indexedDBStorage, 'reflectsRealAbsence').mockReturnValue(false);
    expect(await DeviceManager.getItem('castInfo')).toBeNull();

    read.mockResolvedValue('restored');
    usable.mockReturnValue(true);

    expect(await DeviceManager.getItem('castInfo')).toBe('restored');
  });

  it('still caches a genuine absence, so a healthy read happens once', async () => {
    const read = vi.spyOn(indexedDBStorage, 'getItem').mockResolvedValue(null);
    vi.spyOn(indexedDBStorage, 'reflectsRealAbsence').mockReturnValue(true);

    expect(await DeviceManager.getItem('castInfo')).toBeNull();
    expect(await DeviceManager.getItem('castInfo')).toBeNull();

    expect(read).toHaveBeenCalledTimes(1);
  });
});
