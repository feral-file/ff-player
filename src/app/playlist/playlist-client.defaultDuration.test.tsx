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

const { getItemRefMock } = vi.hoisted(() => ({ getItemRefMock: vi.fn() }));

vi.mock('@/services/DP1Service', () => ({
  DP1Service: {
    getItemRef: getItemRefMock,
    getPlaylist: vi.fn(),
  },
}));

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

});

describe('PlaylistClient — merge-cache lifetime and pre-merge window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    await setDeviceDefault(null);
    vi.clearAllMocks();
  });

});

describe('PlaylistClient — bounded manifest wait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    await setDeviceDefault(null);
    vi.clearAllMocks();
  });

  it('applies the owner default after the bounded manifest wait', async () => {
    await setDeviceDefault(5);
    // Manifest never resolves and carries no veto anywhere: after the
    // bounded gate window (REF_MANIFEST_GATE_TIMEOUT_MS) the merge proceeds
    // with the synchronous layers and the owner's default governs.
    getItemRefMock.mockReturnValue(new Promise(() => undefined) as never);
    const items = [refItem('a', 300), item('b', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(0);
    // Within the bounded window: conservative, no override armed.
    await advanceMs(5000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);

    // Past the window (10s) the sync merge lands permissive and the 5s
    // override arms; well before the item's own 300s the slot advances.
    await advanceMs(5000);
    await advanceMs(5000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('drops the cached merge when a new playlist replaces the item', async () => {
    await setDeviceDefault(5);
    // First display: manifest allows overrides; the merge lands and the
    // device default becomes armed for item 'a'.
    getItemRefMock.mockResolvedValue(
      manifestWithDisplay({ userOverrides: true }) as never
    );
    const permissive = [refItem('a', 30), item('b', 300)];
    const initial = displayCast(permissive, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { rerender } = render(<PlaylistHarness castInfo={initial} />);
    await advanceMs(0);

    // New display carries the same id/ref item, now sync-vetoed, with its
    // manifest merge kept pending. A stale cached merge (userOverrides=true)
    // must not let the device default cut the new slot short.
    getItemRefMock.mockReturnValue(new Promise(() => undefined) as never);
    const vetoed = [
      { ...refItem('a', 30), display: { userOverrides: false } } as DP1Item,
      item('b', 300),
    ];
    const next = displayCast(vetoed, 0, LoopMode.playlist);
    canvasService.setCastInfo(next, false);
    rerender(<PlaylistHarness castInfo={next} />);

    await advanceMs(0);
    await advanceMs(5000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);

    await advanceMs(25000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('does not reuse a same-id slot merge across an in-playlist advance', async () => {
    await setDeviceDefault(5);
    // Slot 0 and slot 1 share id/ref; slot 1 is sync-vetoed per-slot. Slot
    // 0's merge resolves permissive; slot 1's manifest merge stays pending,
    // so only its slot-keyed (absent) merge may gate the device default.
    getItemRefMock
      .mockResolvedValueOnce(
        manifestWithDisplay({ userOverrides: true }) as never
      )
      .mockReturnValue(new Promise(() => undefined) as never);
    const items = [
      refItem('a', 30),
      { ...refItem('a', 30), display: { userOverrides: false } } as DP1Item,
    ];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    // Slot 0: merge lands permissive, device default advances at 5s.
    await advanceMs(0);
    await advanceMs(5000);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    // Slot 1: same id/ref, merge pending. A stale slot-0 merge must not arm
    // the 5s override; the slot's own 30s duration governs.
    await advanceMs(5000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
    await advanceMs(25000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);
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
