import { CastCommand } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceManager from '@/utils/DeviceManager';
import { canvasService } from './CanvasService';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string, items: DP1Item[]): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items,
});

describe('CanvasService updateDefaultDuration', () => {
  beforeEach(() => {
    // getStatus reads window.location to derive sleep state; the node test
    // environment has no window, so stub the minimal surface it touches.
    vi.stubGlobal('window', { location: { pathname: '/playlist' } });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    canvasService.setCastInfo(null, false);
    await DeviceManager.setDefaultItemDurationSeconds(null);
  });

  it('persists the override and reports it through getStatus', () => {
    const reply = canvasService.processMessage({
      command: CastCommand.updateDefaultDuration,
      request: { durationSeconds: 600 },
    });

    expect(reply).toEqual({ ok: true });
    expect(DeviceManager.getCachedDefaultItemDurationSeconds()).toBe(600);
    expect(canvasService.getStatus().deviceSettings?.defaultDuration).toBe(600);
  });

  it('republishes castInfo so the playlist route re-arms the slot timer', () => {
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A', 'B'].map(item)),
        index: 1,
      },
      false
    );

    canvasService.processMessage({
      command: CastCommand.updateDefaultDuration,
      request: { durationSeconds: 60 },
    });

    const next = canvasService.getCastInfo();
    expect(next?.castCommand).toBe(CastCommand.updateDefaultDuration);
    expect(next?.playlist?.items?.map(entry => entry.id)).toEqual(['A', 'B']);
    expect(next?.index).toBe(1);
  });

  it('accepts the command with no active cast session', () => {
    const reply = canvasService.processMessage({
      command: CastCommand.updateDefaultDuration,
      request: { durationSeconds: 300 },
    });

    expect(reply).toEqual({ ok: true });
    expect(canvasService.getCastInfo()).toBeNull();
    expect(DeviceManager.getCachedDefaultItemDurationSeconds()).toBe(300);
  });

  it('clears the override with a null duration ("auto")', () => {
    canvasService.processMessage({
      command: CastCommand.updateDefaultDuration,
      request: { durationSeconds: 600 },
    });
    const reply = canvasService.processMessage({
      command: CastCommand.updateDefaultDuration,
      request: { durationSeconds: null },
    });

    expect(reply).toEqual({ ok: true });
    expect(DeviceManager.getCachedDefaultItemDurationSeconds()).toBeNull();
    expect(
      canvasService.getStatus().deviceSettings?.defaultDuration
    ).toBeUndefined();
  });

});

describe('CanvasService updateDefaultDuration edge inputs', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { location: { pathname: '/playlist' } });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    canvasService.setCastInfo(null, false);
    await DeviceManager.setDefaultItemDurationSeconds(null);
  });

  it('treats a missing request envelope as clearing the override', () => {
    canvasService.processMessage({
      command: CastCommand.updateDefaultDuration,
      request: { durationSeconds: 600 },
    });
    const reply = canvasService.processMessage({
      command: CastCommand.updateDefaultDuration,
    });

    expect(reply).toEqual({ ok: true });
    expect(DeviceManager.getCachedDefaultItemDurationSeconds()).toBeNull();
  });

  it('rejects non-positive and non-finite durations without persisting', () => {
    const invalidDurations = [0, -5, Number.NaN, Number.POSITIVE_INFINITY];
    for (const durationSeconds of invalidDurations) {
      const reply = canvasService.processMessage({
        command: CastCommand.updateDefaultDuration,
        request: { durationSeconds },
      });
      expect(reply).toEqual({ ok: false });
    }
    expect(DeviceManager.getCachedDefaultItemDurationSeconds()).toBeNull();
  });
});
