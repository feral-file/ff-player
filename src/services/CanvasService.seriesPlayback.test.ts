import { CastCommand } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { DP1SeriesPlayback } from '@/models/dp1.model';
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

describe('CanvasService updateSeriesPlayback', () => {
  beforeEach(() => {
    // getStatus reads window.location to derive sleep state; the node test
    // environment has no window, so stub the minimal surface it touches.
    vi.stubGlobal('window', { location: { pathname: '/playlist' } });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    canvasService.setCastInfo(null, false);
    await DeviceManager.setSeriesPlayback(null);
  });

  it('persists the override and reports it through getStatus', () => {
    const reply = canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: DP1SeriesPlayback.Full },
    });

    expect(reply).toEqual({ ok: true });
    expect(DeviceManager.getCachedSeriesPlayback()).toBe(
      DP1SeriesPlayback.Full
    );
    expect(canvasService.getStatus().deviceSettings?.seriesPlayback).toBe(
      DP1SeriesPlayback.Full
    );
  });

  it('a null mode clears the override back to auto', () => {
    canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: DP1SeriesPlayback.Full },
    });

    const reply = canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: null },
    });

    expect(reply).toEqual({ ok: true });
    expect(DeviceManager.getCachedSeriesPlayback()).toBeNull();
    // Absent, not `first`: the item's own intent stands again, and a
    // controller must be able to tell those apart.
    expect(
      canvasService.getStatus().deviceSettings?.seriesPlayback
    ).toBeUndefined();
  });

  it('a missing request envelope clears it too', () => {
    canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: DP1SeriesPlayback.First },
    });

    expect(
      canvasService.processMessage({
        command: CastCommand.updateSeriesPlayback,
      })
    ).toEqual({ ok: true });
    expect(DeviceManager.getCachedSeriesPlayback()).toBeNull();
  });

  it('refuses a mode it cannot honour, leaving the override as it was', () => {
    canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: DP1SeriesPlayback.Full },
    });

    const reply = canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: 'every' as DP1SeriesPlayback },
    });

    expect(reply).toEqual({ ok: false });
    expect(DeviceManager.getCachedSeriesPlayback()).toBe(
      DP1SeriesPlayback.Full
    );
  });

  it('stores random, which playback resolves to first', () => {
    // Accepted on the wire so a controller offering three choices is not
    // refused; `resolveSeriesPlayback` is where it collapses.
    const reply = canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: DP1SeriesPlayback.Random },
    });

    expect(reply).toEqual({ ok: true });
    expect(DeviceManager.getCachedSeriesPlayback()).toBe(
      DP1SeriesPlayback.Random
    );
  });

  it('republishes castInfo so the playlist route re-selects the slot', () => {
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A', 'B'].map(item)),
        index: 1,
      },
      false
    );

    canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: DP1SeriesPlayback.Full },
    });

    const next = canvasService.getCastInfo();
    expect(next?.castCommand).toBe(CastCommand.updateSeriesPlayback);
    expect(next?.playlist?.items?.map(entry => entry.id)).toEqual(['A', 'B']);
    expect(next?.index).toBe(1);
  });

  it('accepts the command with no active cast session', () => {
    const reply = canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode: DP1SeriesPlayback.First },
    });

    expect(reply).toEqual({ ok: true });
    expect(canvasService.getCastInfo()).toBeNull();
    expect(DeviceManager.getCachedSeriesPlayback()).toBe(
      DP1SeriesPlayback.First
    );
  });
});
