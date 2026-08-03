/**
 * Route-level coverage for the playback watchdog wiring (ff-app#520, Layers
 * C+D): PlaylistClient must pass `onRenderStatusChange` to ArtworkPlayer and
 * force-advance a no-duration slot that gets stuck loading, while leaving a
 * healthy render and a has-duration slot alone. The pure timer logic is covered
 * in `useRenderWatchdog.test.tsx`.
 */
import {
  NO_DURATION_VALUE,
  RENDER_WATCHDOG_FAILURE_GRACE_MS,
  RENDER_WATCHDOG_LOAD_TIMEOUT_MS,
} from '@/constants';
import { RenderStatus } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import type { DP1Item } from '@/models/dp1.model';
import DeviceManager from '@/utils/DeviceManager';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlaylistHarness,
  advanceMs,
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

function noDurationItem(id: string): DP1Item {
  return item(id, NO_DURATION_VALUE);
}

function props(): Record<string, unknown> {
  const g = globalThis as { __artworkPlayerProps?: Record<string, unknown> };
  if (!g.__artworkPlayerProps) {
    throw new Error('ArtworkPlayer was not rendered');
  }
  return g.__artworkPlayerProps;
}

function currentPreviewURL(): string {
  return props().previewURL as string;
}

function emitRenderStatus(status: RenderStatus | undefined): void {
  const cb = props().onRenderStatusChange as
    | ((s: RenderStatus | undefined) => void)
    | undefined;
  if (!cb) {
    throw new Error('onRenderStatusChange was not wired through to ArtworkPlayer');
  }
  act(() => { cb(status); });
}

async function advanceSteps(totalMs: number, stepMs = 5000): Promise<void> {
  for (let t = 0; t < totalMs; t += stepMs) {
    await advanceMs(Math.min(stepMs, totalMs - t));
  }
}

describe('PlaylistClient — render watchdog wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    await DeviceManager.setDefaultItemDurationSeconds(null);
  });

  it('wires onRenderStatusChange through to ArtworkPlayer', () => {
    render(
      <PlaylistHarness
        castInfo={displayCast(
          [noDurationItem('a'), noDurationItem('b')],
          0,
          LoopMode.playlist
        )}
      />
    );
    expect(typeof props().onRenderStatusChange).toBe('function');
  });

  it('force-advances a no-duration slot stuck loading', async () => {
    render(
      <PlaylistHarness
        castInfo={displayCast(
          [noDurationItem('a'), noDurationItem('b')],
          0,
          LoopMode.playlist
        )}
      />
    );
    expect(currentPreviewURL()).toContain('a.jpg');

    // No ready/failed ever arrives → stuck load → force-advance to 'b'.
    await advanceSteps(RENDER_WATCHDOG_LOAD_TIMEOUT_MS + 1000);
    expect(currentPreviewURL()).toContain('b.jpg');
  });

  it('does not advance a no-duration slot that reaches ready', async () => {
    render(
      <PlaylistHarness
        castInfo={displayCast(
          [noDurationItem('a'), noDurationItem('b')],
          0,
          LoopMode.playlist
        )}
      />
    );
    emitRenderStatus(RenderStatus.ready);

    await advanceSteps(RENDER_WATCHDOG_LOAD_TIMEOUT_MS + 1000);
    expect(currentPreviewURL()).toContain('a.jpg');
  });

  it('force-advances a no-duration slot that fails, after the grace', async () => {
    render(
      <PlaylistHarness
        castInfo={displayCast(
          [noDurationItem('a'), noDurationItem('b')],
          0,
          LoopMode.playlist
        )}
      />
    );
    emitRenderStatus(RenderStatus.failed);

    await advanceMs(RENDER_WATCHDOG_FAILURE_GRACE_MS - 100);
    expect(currentPreviewURL()).toContain('a.jpg');

    await advanceMs(200);
    expect(currentPreviewURL()).toContain('b.jpg');
  });

  it('leaves a has-duration slot to its own timer (no watchdog cutoff)', async () => {
    render(
      <PlaylistHarness
        castInfo={displayCast(
          [item('a', 60), item('b', 60)],
          0,
          LoopMode.playlist
        )}
      />
    );
    // The load-timeout window passes but a 60s duration item must still be on
    // screen — the watchdog never watches has-duration slots.
    await advanceSteps(RENDER_WATCHDOG_LOAD_TIMEOUT_MS + 1000);
    expect(currentPreviewURL()).toContain('a.jpg');
  });
});
