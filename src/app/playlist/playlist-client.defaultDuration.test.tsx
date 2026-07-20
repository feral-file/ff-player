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
import { clearRefManifestDisplayCache } from '@/utils/playlistDisplayPreference';
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

/**
 * Advance fake time in act-sized steps. Effects (including the merge-landed
 * re-arm) flush at each act boundary, so stepped advancement lets timers
 * scheduled by those effects fire within the same logical wait — mirroring
 * real time, where effects run between timer ticks.
 */
async function advanceSteps(totalMs: number, stepMs = 5000): Promise<void> {
  for (let t = 0; t < totalMs; t += stepMs) {
    await advanceMs(Math.min(stepMs, totalMs - t));
  }
}

describe('PlaylistClient — device default duration vs ref-manifest gates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    clearRefManifestDisplayCache();
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

describe('PlaylistClient — bounded manifest wait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    clearRefManifestDisplayCache();
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

});

describe('PlaylistClient — in-session updateDefaultDuration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    clearRefManifestDisplayCache();
    await setDeviceDefault(null);
    vi.clearAllMocks();
  });

  it('re-arms the active slot mid-session and clears with null', async () => {
    const items = [item('a', 300), item('b', 300), item('c', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    const { rerender } = render(<PlaylistHarness castInfo={initial} />);
    await advanceMs(0);

    // Mid-slot: the owner sets 60s via the real command path.
    await advanceSteps(30000);
    canvasService.processMessage({
      command: 'updateDefaultDuration',
      request: { durationSeconds: 60 },
    });
    rerender(
      <PlaylistHarness castInfo={canvasService.getCastInfo() ?? null} />
    );

    // The active slot re-arms from now: advance at +60s, not the item's 300s
    // from slot entry, and without invoking the artwork reload path.
    const g = globalThis as { __artworkReloadInvocations?: number };
    const reloadsBefore = g.__artworkReloadInvocations ?? 0;
    await advanceSteps(60000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
    expect(g.__artworkReloadInvocations ?? 0).toBe(reloadsBefore);

    // Clearing with null restores the playlist's own timing for later slots.
    canvasService.processMessage({
      command: 'updateDefaultDuration',
      request: { durationSeconds: null },
    });
    rerender(
      <PlaylistHarness castInfo={canvasService.getCastInfo() ?? null} />
    );
    await advanceSteps(60000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
    await advanceSteps(240000);
    expect(canvasService.getCastInfo()?.index).toBe(2);
  });
});

describe('PlaylistClient — baseline timing without a device default', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    clearRefManifestDisplayCache();
    await setDeviceDefault(null);
    vi.clearAllMocks();
  });

  it('a landing merge does not restart the baseline timer', async () => {
    // No device default: the merge cannot change the timer, so a ref item
    // whose manifest lands mid-slot must keep its elapsed time — a 30s item
    // advances at 30s, not 30s after the ~10s bounded merge.
    getItemRefMock.mockReturnValue(new Promise(() => undefined) as never);
    const items = [refItem('a', 30), item('b', 300), item('c', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(0);
    await advanceSteps(25000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);
    await advanceSteps(5000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });
});

describe('PlaylistClient — late manifest vetoes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    clearRefManifestDisplayCache();
    await setDeviceDefault(null);
    vi.clearAllMocks();
  });

  it('a decisive local veto arms the baseline without waiting for the manifest', async () => {
    await setDeviceDefault(60);
    // The item's own display veto outranks whatever the (hung) manifest
    // might say, so the 5s baseline must arm at slot entry — not after the
    // bounded manifest wait.
    getItemRefMock.mockReturnValue(new Promise(() => undefined) as never);
    const items = [
      {
        ...refItem('a', 5),
        display: { userOverrides: false },
      } as DP1Item,
      item('b', 300),
      item('c', 300),
    ];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(0);
    await advanceMs(5000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('a mid-slot veto preserves the item duration elapsed time', async () => {
    await setDeviceDefault(60);
    // Item's own duration (5s) is shorter than the device default (60s).
    // The manifest resolves with a veto 2s in — before the baseline would
    // have expired. The item must advance at ~5s from slot entry, neither
    // early (pre-merge hold has no timer) nor restarted (7s).
    let resolveLate: ((value: unknown) => void) | undefined;
    getItemRefMock.mockReturnValue(
      new Promise(resolve => {
        resolveLate = resolve;
      }) as never
    );
    const items = [refItem('a', 5), item('b', 300), item('c', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);
    await advanceMs(0);

    await advanceMs(2000);
    resolveLate?.(manifestWithDisplay({ userOverrides: false }));
    await advanceMs(0);
    // 2s elapsed under the veto's baseline: only ~3s remain.
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);
    await advanceMs(3000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('a late veto never rewinds an advanced slot and binds its next visit', async () => {
    await setDeviceDefault(5);
    let resolveLate: ((value: unknown) => void) | undefined;
    getItemRefMock.mockReturnValue(
      new Promise(resolve => {
        resolveLate = resolve;
      }) as never
    );
    const items = [refItem('a', 30), item('b', 300), item('c', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    // Bounded merge at ~10s (sync-permissive), override 5s, advance at ~15s.
    await advanceMs(0);
    await advanceSteps(15000);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    // The manifest veto arrives only now — after the slot advanced. It must
    // not rewind playback; it lands in the session cache instead.
    resolveLate?.(manifestWithDisplay({ userOverrides: false }));
    await advanceMs(0);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    // b and c advance under the override; playback wraps to slot a.
    await advanceSteps(5000);
    expect(canvasService.getCastInfo()?.index).toBe(2);
    await advanceSteps(5000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);

    // Revisit: the cached veto is known at slot entry — the device default
    // never arms and the item's own 30s duration governs.
    await advanceSteps(5000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);
    await advanceSteps(25000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });
});

describe('PlaylistClient — merge-cache lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    clearRefManifestDisplayCache();
    await setDeviceDefault(null);
    vi.clearAllMocks();
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
      item('c', 300),
    ];
    const next = displayCast(vetoed, 0, LoopMode.playlist);
    canvasService.setCastInfo(next, false);
    rerender(<PlaylistHarness castInfo={next} />);

    // The ref display is session-cached from the first cast, so the new
    // cast's merge lands immediately — recomputed against the new item's
    // sync veto rather than reusing the stale slot merge. The device default
    // must never arm; the item's own 30s duration governs from entry.
    await advanceMs(0);
    await advanceSteps(5000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);

    await advanceSteps(25000);
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
      item('c', 300),
    ];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    // Slot 0: merge lands permissive, device default advances at 5s.
    await advanceMs(0);
    await advanceSteps(5000);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    // Slot 1: same id/ref. Its merge is recomputed for the slot (ref display
    // session-cached, so it lands at entry) and the per-slot sync veto wins —
    // a stale slot-0 merge must not arm the 5s override. The 30s baseline
    // governs from slot entry (t=5), advancing at t=35.
    await advanceSteps(25000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
    await advanceSteps(5000);
    expect(canvasService.getCastInfo()?.index).toBe(2);
  });

  it('holds a ref slot pre-merge, then applies the override after the bound', async () => {
    await setDeviceDefault(5);
    // Manifest never resolves. With a device default set, the slot arms no
    // timer pre-merge — the item's short duration must not advance ahead of
    // the owner's longer setting, nor may the override fire against unknown
    // gates. The bounded merge (~10s) lands permissive and arms the 5s
    // override, advancing at ~15s.
    getItemRefMock.mockReturnValue(new Promise(() => undefined) as never);
    const items = [refItem('a', 30), item('b', 300), item('c', 300)];
    const initial = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<PlaylistHarness castInfo={initial} />);

    await advanceMs(0);
    await advanceSteps(5000);
    expect(canvasService.getCastInfo()?.index ?? 0).toBe(0);

    await advanceSteps(10000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });
});
