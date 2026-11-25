// @vitest-environment jsdom
import { canvasService } from '@/services/CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BootHydration } from './BootHydration';

const item = (id: string, duration?: number): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, duration }) as DP1Item;

// A stored boot record keeps the document as accepted (no resolved
// durations), so restore must apply DP-1 core §4 inheritance itself.
describe('BootHydration restores defaults.duration inheritance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    canvasService.setCastInfo(null, false);
  });

  it('resolves an item without duration to defaults.duration', async () => {
    const stored = {
      dpVersion: '1.1.0',
      id: 'boot',
      title: 'boot',
      defaults: { duration: 30 },
      items: [item('A'), item('B', 5)],
    } as DP1Call;
    vi.spyOn(DeviceManager, 'getBootPlaylist').mockResolvedValue(stored);
    vi.spyOn(DeviceManager, 'getItem').mockResolvedValue(null);
    vi.spyOn(DeviceManager, 'getLoopMode').mockResolvedValue(
      undefined as never
    );
    const setCastInfo = vi.fn();

    await new BootHydration({
      initializeDisplaySettings: async () => undefined,
      setInitialized: () => undefined,
      requestFallbackPlaylist: () => undefined,
      setCastInfo,
      navigateToHomePage: () => undefined,
    }).initialize();

    const restored = canvasService.getCastInfo();
    expect(restored?.playlist?.items?.map(i => i.duration)).toEqual([30, 5]);
  });
});
