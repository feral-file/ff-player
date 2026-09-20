/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Scaling } from '@/models/dp1.model';
import { TombstoneMode, type DisplaySettings } from '@/models/display_settings.model';
import type { DeviceFraming } from '@/utils/deviceFraming';
import DeviceManager from '@/utils/DeviceManager';
import { canvasService } from '../CanvasService';
import { useArtworkSettings } from './useArtworkSettings';
import { useDeviceSettings } from './useDeviceSettings';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('saves an owner choice, applies it across works, and restores it after restart', async () => {
  const persisted = vi.spyOn(DeviceManager, 'setDeviceDisplaySettings').mockResolvedValue();
  const { result, rerender, unmount } = renderHook(({ work }: { work: string }) => {
    const device = useDeviceSettings();
    const artwork = useArtworkSettings({ scaling: Scaling.Fit }, work, device.displaySettings?.framing);
    return { device, artwork };
  }, { initialProps: { work: 'one' } });
  act(() => { canvasService.updateDisplaySettings({ isSaved: true, framing: 'fill' }); });
  await waitFor(() => { expect(persisted).toHaveBeenLastCalledWith(expect.objectContaining({ framing: 'fill' })); });
  expect(result.current.artwork.displaySettings?.scaling).toBe(Scaling.Fill);
  rerender({ work: 'another-channel' });
  expect(result.current.artwork.displaySettings?.scaling).toBe(Scaling.Fill);
  const saved = JSON.parse(JSON.stringify(result.current.device.displaySettings)) as DisplaySettings;
  unmount();
  const restarted = renderHook(() => useArtworkSettings({ scaling: Scaling.Fit }, 'one', saved.framing));
  expect(restarted.result.current.displaySettings?.scaling).toBe(Scaling.Fill);
});

it('keeps tombstones on partial writes and restores authored framing when cleared', () => {
  vi.spyOn(DeviceManager, 'setDeviceDisplaySettings').mockResolvedValue();
  const { result } = renderHook(() => {
    const device = useDeviceSettings();
    return { device, artwork: useArtworkSettings({ scaling: Scaling.Fill }, 'one', device.displaySettings?.framing) };
  });
  act(() => { canvasService.updateDisplaySettings({ isSaved: true, tombstone: TombstoneMode.Off }); });
  act(() => { canvasService.updateDisplaySettings({ isSaved: true, framing: 'fit' }); });
  expect(result.current.artwork.displaySettings?.scaling).toBe(Scaling.Fit);
  act(() => { canvasService.updateDisplaySettings({ isSaved: true, framing: 'artwork' }); });
  expect(result.current.artwork.displaySettings?.scaling).toBe(Scaling.Fill);
  expect(result.current.device.displaySettings?.tombstone).toBe(TombstoneMode.Off);
});

it('reports the saved choice separately from effective scaling with no artwork', () => {
  vi.spyOn(DeviceManager, 'getCachedDeviceDisplaySettings').mockReturnValue({ framing: 'fill' });
  expect(canvasService.getStatus().deviceSettings?.framing).toBe('fill');
});

it('rejects malformed or temporary framing preferences', () => {
  expect(canvasService.updateDisplaySettings({ isSaved: false, framing: 'fill' }).ok).toBe(false);
  expect(canvasService.updateDisplaySettings({ isSaved: true, framing: 'stretch' as DeviceFraming }).ok).toBe(false);
});
