/**
 * Route-level regression coverage for the device default-duration override
 * when the gating display preference arrives through the async cascade —
 * specifically the `item.ref` manifest layer that the synchronous merge
 * cannot see. Complements the pure resolver tests in `utils/playlist.test.ts`.
 */
import { NO_DURATION_VALUE } from '@/constants';
import type { DP1Item } from '@/models/dp1.model';
import { LoopMode } from '@/models/cast_info.model';
import { canvasService } from '@/services/CanvasService';
import { DP1Service } from '@/services/DP1Service';
import DeviceManager from '@/utils/DeviceManager';
import { render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlaylistHarness,
  advanceMs,
  callSourceEnded,
  displayCast,
  item,
  teardownPlaylistWiringTest,
} from './playlist-client.testkit';

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function MockArtworkPlayer(props: Record<string, unknown>) {
    const g = globalThis as { __artworkPlayerProps?: Record<string, unknown> };
    g.__artworkPlayerProps = props;
    return null;
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/services/DP1Service', () => ({
  DP1Service: {
    getItemRef: vi.fn(),
    getPlaylist: vi.fn(),
  },
}));

const getItemRefMock = vi.mocked(DP1Service.getItemRef);

function refItem(id: string, durationSeconds: number): DP1Item {
  return {
    ...item(id, durationSeconds),
    ref: `https://example.com/${id}-manifest.json`,
  } as DP1Item;
}

function manifestWithDisplay(display: Record<string, unknown>): unknown {
  return { controls: { display } };
}

async function setDeviceDefault(seconds: number | null): Promise<void> {
  await DeviceManager.setDefaultItemDurationSeconds(seconds);
}

describe('PlaylistClient — device default duration vs ref-manifest gates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    await setDeviceDefault(null);
    vi.clearAllMocks();
  });

  it('applies the device default to an unconstrained item', async () => {
    await setDeviceDefault(5);
    const items = [item('a', 300), item('b', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    // Let the async display-preference merge land and re-arm the timer.
    await advanceMs(0);
    await advanceMs(5000);

    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('never re-times an item whose manifest carries userOverrides=false', async () => {
    await setDeviceDefault(5);
    getItemRefMock.mockResolvedValue(
      manifestWithDisplay({ userOverrides: false }) as never
    );
    const items = [refItem('a', 30), item('b', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(0);
    // Device default (5s) elapses: the artist veto must hold the slot.
    await advanceMs(5000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);

    // The item's own duration still advances it.
    await advanceMs(25000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('never cuts short a manifest-declared loop=false item', async () => {
    await setDeviceDefault(5);
    getItemRefMock.mockResolvedValue(
      manifestWithDisplay({ loop: false }) as never
    );
    const items = [refItem('a', NO_DURATION_VALUE), item('b', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(0);
    // Well past the device default: natural-length item must still hold.
    await advanceMs(60000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);

    // End-of-stream is what advances it.
    callSourceEnded('a');
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('does not apply the override before the merge for the slot lands', async () => {
    await setDeviceDefault(5);
    // Manifest never resolves: the pre-merge window persists for the whole
    // test, so the item's own duration must govern the timer.
    getItemRefMock.mockReturnValue(new Promise(() => undefined) as never);
    const items = [refItem('a', 30), item('b', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(0);
    await advanceMs(5000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);

    await advanceMs(25000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });
});
