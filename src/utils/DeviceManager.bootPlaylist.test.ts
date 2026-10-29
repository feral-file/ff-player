/**
 * The boot cast and the content context it was accepted under must never
 * disagree. Two keys would be two best-effort IndexedDB writes — `setItem`
 * swallows a failure — so a reboot between them could pair a new playlist with
 * the previous cast's origin and apply the wrong family-content filter.
 */
import { LocalStorageItem } from '@/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from './DeviceManager';
import indexedDBStorage from './IndexedDBStorage';
import { DP1Call, DP1License } from '@/models/dp1.model';

/** The enum's string value; the storage mocks receive a plain string key. */
const bootKey: string = LocalStorageItem.bootPlaylist;

const playlist = (id: string): DP1Call => ({
  dpVersion: '1.1.0',
  id,
  title: 'Boot set',
  items: [{ id: `${id}-item`, source: 'https://art.test/a', license: DP1License.Open }],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('boot playlist and its content context', () => {
  it('writes the playlist and its origin in a single stored value', async () => {
    const writes: string[] = [];
    vi.spyOn(indexedDBStorage, 'setItem').mockImplementation((key, value) => {
      if (key === bootKey) {
        writes.push(value);
      }
      return Promise.resolve();
    });

    await DeviceManager.setBootPlaylist(playlist('personal-set'), 'personal');

    // One write is what makes the pair atomic. A second write for the context
    // is exactly the partial-failure window this guards against.
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toEqual({
      playlist: playlist('personal-set'),
      contentContext: 'personal',
    });
  });

  it('reads back the playlist and the origin it was stored with', async () => {
    vi.spyOn(indexedDBStorage, 'setItem').mockResolvedValue(undefined);

    await DeviceManager.setBootPlaylist(playlist('personal-set'), 'personal');

    expect(await DeviceManager.getBootPlaylist()).toEqual(playlist('personal-set'));
    expect(await DeviceManager.getBootPlaylistContentContext()).toBe('personal');
  });

  it('keeps the signed document intact inside the envelope', async () => {
    vi.spyOn(indexedDBStorage, 'setItem').mockResolvedValue(undefined);
    const signed = { ...playlist('signed-set'), signature: 'ed25519:original' };

    await DeviceManager.setBootPlaylist(signed, 'curated');

    // The context rides beside the document, never inside it, so the stored
    // DP-1 playlist is still exactly what was received and signed.
    const restored = await DeviceManager.getBootPlaylist();
    expect(restored).toEqual(signed);
    expect(restored).not.toHaveProperty('contentContext');
  });

  it('reads a pre-policy bare playlist record as curated', async () => {
    const legacy = playlist('legacy-set');
    vi.spyOn(indexedDBStorage, 'setItem').mockResolvedValue(undefined);
    vi.spyOn(indexedDBStorage, 'getItem').mockImplementation(key =>
      Promise.resolve(key === bootKey ? JSON.stringify(legacy) : null)
    );
    // Drop the cached envelope from the writes above so the legacy value is read.
    (DeviceManager as unknown as { cache: Map<string, string | null> }).cache.delete(
      LocalStorageItem.bootPlaylist
    );

    expect(await DeviceManager.getBootPlaylist()).toEqual(legacy);
    // An upgrade must not promote an old boot cast to an unfiltered personal one.
    expect(await DeviceManager.getBootPlaylistContentContext()).toBe('curated');
  });
});
