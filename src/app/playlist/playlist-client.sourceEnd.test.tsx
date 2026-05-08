/**
 * PlaylistClient end-of-stream coverage. Split from playlist-client.test.tsx
 * to keep individual test files under the project's max-lines lint cap.
 * Shared harness pieces live in playlist-client.testkit.tsx.
 *
 * Real ArtworkPlayer slot/media wiring is covered in
 * ArtworkPlayer.refresh.test.tsx and ArtworkPlayer.sourceEnd.test.tsx
 * (this file mocks ArtworkPlayer).
 */
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { NO_DURATION_VALUE } from '@/constants';
import { canvasService } from '@/services/CanvasService';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advanceMs,
  callOnSourceEndedRaw,
  callSourceEnded,
  displayCast,
  dp1Call,
  item,
  PlaylistHarness,
  teardownPlaylistWiringTest,
} from './playlist-client.testkit';

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function MockArtworkPlayer(props: Record<string, unknown>) {
    const g = globalThis as {
      __artworkPlayerProps?: Record<string, unknown>;
      __artworkReloadInvocations?: number;
    };
    g.__artworkPlayerProps = props;
    React.useLayoutEffect(() => {
      const reg = props.onRegisterArtworkReload as
        | ((fn: (() => void) | null) => void)
        | undefined;
      if (!reg) {
        return;
      }
      const reload = () => {
        g.__artworkReloadInvocations =
          (g.__artworkReloadInvocations ?? 0) + 1;
      };
      reg(reload);
      return () => {
        reg(null);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- module-level probe
    }, [props.onRegisterArtworkReload]);
    return null;
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

function countUpdateIndexCalls(spy: ReturnType<typeof vi.spyOn>): number {
  return spy.mock.calls.filter(
    args =>
      (args[0] as { castCommand?: string } | null)?.castCommand ===
      CastCommand.updateIndex
  ).length;
}

// DP-1 §4.1: when display.loop is false, time-based items advance at
// end-of-stream. PlaylistClient wires that signal to the same advance
// machinery the duration timer drives.
describe('PlaylistClient — source-end advance (DP-1 §4.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('advances when source ends and no duration is set', async () => {
    const items = [item('a', NO_DURATION_VALUE), item('b', 1)];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.playlist), false);
    render(<PlaylistHarness castInfo={displayCast(items, 0, LoopMode.playlist)} />);

    await advanceMs(60000);
    expect(canvasService.getCastInfo()?.index).toBe(0);

    callSourceEnded(items[0].id);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('source-end races duration timer; whichever fires first wins', async () => {
    const items = [item('a', 5), item('b', NO_DURATION_VALUE)];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.playlist), false);
    render(<PlaylistHarness castInfo={displayCast(items, 0, LoopMode.playlist)} />);

    await advanceMs(1000);
    expect(canvasService.getCastInfo()?.index).toBe(0);

    callSourceEnded(items[0].id);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    await advanceMs(10000);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('drops a late source-end after the duration timer already advanced', async () => {
    const items = [item('a', 1), item('b', 1), item('c', 1)];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.playlist), false);
    render(<PlaylistHarness castInfo={displayCast(items, 0, LoopMode.playlist)} />);

    await advanceMs(1000);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    callSourceEnded(items[0].id);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('holds on the final slot when source-end fires under repeat-off', () => {
    const items = [item('a', 1), item('b', NO_DURATION_VALUE)];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.none), false);
    render(<PlaylistHarness castInfo={displayCast(items, 1, LoopMode.none)} />);

    callSourceEnded(items[1].id);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });

  it('drops a late source-end from a previous adjacent same-URL item', () => {
    const items = [
      item('a', NO_DURATION_VALUE),
      item('b', NO_DURATION_VALUE),
      item('c', NO_DURATION_VALUE),
    ];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.playlist), false);
    render(<PlaylistHarness castInfo={displayCast(items, 0, LoopMode.playlist)} />);

    callSourceEnded(items[0].id);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    // Late ended from item 0 arriving after we advanced. The identity guard
    // in PlaylistClient must drop it even when items 0 and 1 share a URL.
    callSourceEnded(items[0].id);
    expect(canvasService.getCastInfo()?.index).toBe(1);
  });
});

// Same-tick race regression: timer + onSourceEnded both fire before React
// commits. The publish-level dedupe collapses the duplicate updateIndex.
describe('PlaylistClient — same-tick race', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('only publishes one updateIndex when timer and source-end race', async () => {
    const items = [item('a', 1), item('b', 1), item('c', 1)];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.playlist), false);
    render(<PlaylistHarness castInfo={displayCast(items, 0, LoopMode.playlist)} />);

    const setCastSpy = vi.spyOn(canvasService, 'setCastInfo');
    setCastSpy.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      callOnSourceEndedRaw(items[0].id);
    });

    expect(countUpdateIndexCalls(setCastSpy)).toBe(1);
    expect(canvasService.getCastInfo()?.index).toBe(1);
    setCastSpy.mockRestore();
  });

  it('only publishes one updateIndex when LoopMode.one races', async () => {
    // LoopMode.one re-publishes the same index instead of advancing.
    // Multi-item dedupe (currentIndexRef = nextIndex) does not apply
    // because nextIndex equals fromIndex; the publish-level dedupe
    // (drops a no-op castCommand=updateIndex/index transition) catches it.
    const items = [item('a', 1), item('b', 1)];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.one), false);
    render(<PlaylistHarness castInfo={displayCast(items, 0, LoopMode.one)} />);

    const setCastSpy = vi.spyOn(canvasService, 'setCastInfo');
    setCastSpy.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      callOnSourceEndedRaw(items[0].id);
    });

    expect(countUpdateIndexCalls(setCastSpy)).toBe(1);
    expect(canvasService.getCastInfo()?.index).toBe(0);
    setCastSpy.mockRestore();
  });
});

// setLoop on a held no-duration item: the timer scheduler is a no-op
// without a duration, so we re-fire the artwork-refresh path to restart
// playback from the held frame. Next end-of-stream then drives advance.
describe('PlaylistClient — setLoop after source-end hold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('replays a no-duration video on source-end in LoopMode.one', () => {
    // LoopMode.one re-publishes the same index instead of advancing. For a
    // no-duration time-based item (display.loop=false at the spec level)
    // the duration timer is a no-op, so the slot would otherwise park on
    // its final frame. PlaylistClient explicitly re-fires the artwork
    // reload to restart playback; the next end-of-stream drives the next
    // replay through onSourceEnded.
    const items = [
      item('a', NO_DURATION_VALUE),
      item('b', NO_DURATION_VALUE),
    ];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.one), false);
    render(<PlaylistHarness castInfo={displayCast(items, 0, LoopMode.one)} />);

    const reloadsBefore =
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations ?? 0;

    callSourceEnded(items[0].id);

    const reloadsAfter =
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations ?? 0;
    expect(reloadsAfter).toBe(reloadsBefore + 1);
    expect(canvasService.getCastInfo()?.index).toBe(0);
  });

  it('replays a no-duration video on source-end in a single-item playlist', () => {
    // Single-item playlist wraps to itself; the same-slot replay branch
    // must restart playback instead of relying on a duration timer.
    const items = [item('a', NO_DURATION_VALUE)];
    canvasService.setCastInfo(
      displayCast(items, 0, LoopMode.playlist),
      false
    );
    render(
      <PlaylistHarness castInfo={displayCast(items, 0, LoopMode.playlist)} />
    );

    const reloadsBefore =
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations ?? 0;

    callSourceEnded(items[0].id);

    const reloadsAfter =
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations ?? 0;
    expect(reloadsAfter).toBe(reloadsBefore + 1);
  });

  it('restarts a held no-duration video when loop toggles back on', async () => {
    const items = [item('a', 1), item('b', NO_DURATION_VALUE)];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.none), false);
    const { rerender } = render(
      <PlaylistHarness castInfo={displayCast(items, 1, LoopMode.none)} />
    );

    callSourceEnded(items[1].id);
    expect(canvasService.getCastInfo()?.index).toBe(1);

    const reloadsBefore =
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations ?? 0;

    const setLoop: CastInfo = {
      castCommand: CastCommand.setLoop,
      playlist: dp1Call('pl', items),
      index: 1,
      loopMode: LoopMode.playlist,
    };
    canvasService.setCastInfo(setLoop, false);
    rerender(<PlaylistHarness castInfo={setLoop} />);

    await advanceMs(0);

    const reloadsAfter =
      (globalThis as { __artworkReloadInvocations?: number })
        .__artworkReloadInvocations ?? 0;
    expect(reloadsAfter).toBe(reloadsBefore + 1);
  });
});
