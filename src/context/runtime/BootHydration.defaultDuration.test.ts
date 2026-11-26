// @vitest-environment jsdom
import { canvasService } from '@/services/CanvasService';
import { NO_DURATION_VALUE } from '@/constants';
import DeviceManager from '@/utils/DeviceManager';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BootHydration } from './BootHydration';
import { dp1Document, fixtureId } from '@/testing/dp1Fixtures';

const item = (id: string, duration?: number): DP1Item =>
  ({
    id: fixtureId(id),
    source: `https://example.com/${id}.jpg`,
    duration,
  }) as DP1Item;

const stored = (items: DP1Item[]): DP1Call =>
  dp1Document({
    id: fixtureId('boot'),
    title: 'boot',
    defaults: { duration: 30 },
    items,
    signature: 'ed25519:abc',
  });

/** Boot-restores `record` and returns the playlist the player then holds. */
async function restore(record: DP1Call) {
  vi.spyOn(DeviceManager, 'getBootPlaylist').mockResolvedValue(record);
  vi.spyOn(DeviceManager, 'getItem').mockResolvedValue(null);
  vi.spyOn(DeviceManager, 'getLoopMode').mockResolvedValue(undefined as never);

  await new BootHydration({
    initializeDisplaySettings: () => Promise.resolve(),
    setInitialized: () => undefined,
    requestFallbackPlaylist: () => undefined,
    setCastInfo: vi.fn(),
    navigateToHomePage: () => undefined,
  }).initialize();

  return canvasService.getCastInfo()?.playlist;
}

describe('BootHydration restores the stored document', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    canvasService.setCastInfo(null, false);
  });

  it('keeps an untouched signed document as it was stored', async () => {
    const record = stored([item('A'), item('B', 5)]);
    const original = structuredClone(record);

    expect(await restore(record)).toEqual(original);
  });

  // Rows written by older builds carry an injected duration under the
  // document's signature.
  it.each([
    ['the hold sentinel', NO_DURATION_VALUE],
    ['the inherited default', 30],
  ])('drops the signature of a row rewritten with %s', async (_, injected) => {
    const playlist = (await restore(stored([item('A', injected)]))) as
      | Record<string, unknown>
      | undefined;

    expect(playlist?.signature).toBeUndefined();
    expect(playlist?.signatures).toBeUndefined();
  });
});
