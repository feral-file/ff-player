/** @vitest-environment jsdom */
/**
 * Route-level wiring of the device machine-default layer: the persisted
 * device record (AppContext `displaySettings`) reaches the item merge as its
 * lowest DP-1 layer. It fills the gap when the playlist is silent on
 * scaling, never beats a playlist's `defaults.display.scaling`, and a change
 * to the record while a slot is on screen re-resolves that slot.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import type {
  DP1Defaults,
  DP1DisplayPreference,
  DP1Item,
} from '@/models/dp1.model';
import { Scaling } from '@/models/dp1.model';
import type { DisplaySettings } from '@/models/display_settings.model';
import { canvasService } from '@/services/CanvasService';
import DeviceManager from '@/utils/DeviceManager';
import { clearRefManifestDisplayCache } from '@/utils/playlistDisplayPreference';
import { cleanup, render, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlaylistClient from './playlist-client';
import { advanceMs, dp1Call, item } from './playlist-client.testkit';

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function MockArtworkPlayer(props: Record<string, unknown>) {
    (
      globalThis as { __artworkPlayerProps?: Record<string, unknown> }
    ).__artworkPlayerProps = props;
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
  DP1Service: { getItemRef: getItemRefMock, getPlaylist: vi.fn() },
}));

function playerProps(): Record<string, unknown> | undefined {
  return (globalThis as { __artworkPlayerProps?: Record<string, unknown> })
    .__artworkPlayerProps;
}

function renderedPreference(): DP1DisplayPreference | undefined {
  return playerProps()?.displayPreferences as DP1DisplayPreference | undefined;
}

function cast(
  defaults?: Partial<DP1Defaults>,
  items: DP1Item[] = [item('A', 30), item('B', 30)]
): CastInfo {
  return {
    castCommand: CastCommand.displayPlaylist,
    playlist: { ...dp1Call('pl', items), defaults } as never,
    index: 0,
    loopMode: LoopMode.playlist,
  };
}

/** Advance in act-sized steps so effect-scheduled timers fire in sequence. */
async function advanceSteps(totalMs: number, stepMs = 5000): Promise<void> {
  for (let t = 0; t < totalMs; t += stepMs) {
    await advanceMs(Math.min(stepMs, totalMs - t));
  }
}

function Harness(props: {
  castInfo: CastInfo;
  displaySettings: DisplaySettings | null;
}): React.ReactElement {
  const value = React.useMemo(
    () => ({
      context: {
        isInitialized: true,
        isOnline: true,
        appRemoteConfig: {},
        displaySettings: props.displaySettings,
        cursorPositions: null,
        castInfo: props.castInfo,
      },
    }),
    [props.castInfo, props.displaySettings]
  );
  return (
    <AppContext.Provider value={value as never}>
      <PlaylistClient />
    </AppContext.Provider>
  );
}

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  getItemRefMock.mockReset();
  clearRefManifestDisplayCache();
  await DeviceManager.setDefaultItemDurationSeconds(null);
  canvasService.setCastInfo(null, false);
  (
    globalThis as { __artworkPlayerProps?: Record<string, unknown> }
  ).__artworkPlayerProps = undefined;
});

describe('PlaylistClient — device machine-default layer', () => {
  it('fills the gap when the playlist is silent on scaling', async () => {
    render(
      <Harness
        castInfo={cast()}
        displaySettings={{ scaling: Scaling.Fill } as DisplaySettings}
      />
    );
    await waitFor(() => {
      expect(renderedPreference()?.scaling).toBe(Scaling.Fill);
    });
  });

  it('never beats the playlist defaults.display.scaling', async () => {
    render(
      <Harness
        castInfo={cast({ display: { scaling: Scaling.Fill } })}
        displaySettings={{ scaling: Scaling.Fit } as DisplaySettings}
      />
    );
    await waitFor(() => {
      expect(renderedPreference()?.scaling).toBe(Scaling.Fill);
    });
  });

  it('re-resolves the on-screen slot when the record changes late, keeping its timer', async () => {
    vi.useFakeTimers();
    // One cast instance for both renders: only the device record changes,
    // so the resolve must come from the dedicated re-resolve path, not from
    // a playlist replacement (which would also re-arm the slot from zero).
    const castInfo = cast();
    const { rerender } = render(
      <Harness castInfo={castInfo} displaySettings={null} />
    );
    await advanceMs(0);
    expect(renderedPreference()?.scaling).toBe(Scaling.Fit);
    expect(playerProps()?.previewURL).toBe('https://example.com/A.jpg');

    // The IndexedDB read landing 20 s into a 30 s slot.
    await advanceMs(20_000);
    rerender(
      <Harness
        castInfo={castInfo}
        displaySettings={{ scaling: Scaling.Fill } as DisplaySettings}
      />
    );
    await advanceMs(0);
    expect(renderedPreference()?.scaling).toBe(Scaling.Fill);
    expect(playerProps()?.previewURL).toBe('https://example.com/A.jpg');

    // The slot still advances at its original deadline: 10 s later, not 30.
    await advanceMs(10_000);
    expect(playerProps()?.previewURL).toBe('https://example.com/B.jpg');
  });

});

describe('PlaylistClient — device layer keeps slot timing', () => {
  it('keeps the deadline under a device default duration too', async () => {
    vi.useFakeTimers();
    // With a device default the merge-landed re-arm is not skipped; a
    // re-merge that changes only scaling must keep the armed deadline
    // rather than granting a fresh 5 s interval.
    await DeviceManager.setDefaultItemDurationSeconds(5);
    const castInfo = cast();
    const { rerender } = render(
      <Harness castInfo={castInfo} displaySettings={null} />
    );
    await advanceMs(0);
    expect(playerProps()?.previewURL).toBe('https://example.com/A.jpg');

    await advanceMs(4_000);
    rerender(
      <Harness
        castInfo={castInfo}
        displaySettings={{ scaling: Scaling.Fill } as DisplaySettings}
      />
    );
    await advanceMs(0);
    expect(renderedPreference()?.scaling).toBe(Scaling.Fill);
    expect(playerProps()?.previewURL).toBe('https://example.com/A.jpg');

    await advanceMs(1_000);
    expect(playerProps()?.previewURL).toBe('https://example.com/B.jpg');
  });

  it('keeps the armed deadline of a slot that was held pre-merge', async () => {
    vi.useFakeTimers();
    // A ref item is held at entry under a device default while its manifest
    // is pending; the bounded merge (~10 s) arms the 5 s override, so the
    // real deadline is ~15 s after entry. The manifest then lands at 11 s
    // (same gates) and the device scaling record at 12 s: both re-merge
    // the same slot at the same effective duration. Measuring elapsed time
    // from slot entry would schedule 0 ms and skip the artwork; the armed
    // deadline must hold.
    await DeviceManager.setDefaultItemDurationSeconds(5);
    let resolveManifest: (manifest: unknown) => void = () => undefined;
    getItemRefMock.mockReturnValue(
      new Promise(resolve => {
        resolveManifest = resolve;
      }) as never
    );
    const castInfo = cast(undefined, [
      { ...item('A', 30), ref: 'https://example.com/A-manifest.json' } as DP1Item,
      item('B', 300),
    ]);
    const { rerender } = render(
      <Harness castInfo={castInfo} displaySettings={null} />
    );
    await advanceMs(0);
    await advanceSteps(11_000);
    expect(playerProps()?.previewURL).toBe('https://example.com/A.jpg');
    resolveManifest({ controls: { display: {} } });
    await advanceMs(0);

    await advanceMs(1_000);
    rerender(
      <Harness
        castInfo={castInfo}
        displaySettings={{ scaling: Scaling.Fill } as DisplaySettings}
      />
    );
    await advanceMs(0);
    expect(renderedPreference()?.scaling).toBe(Scaling.Fill);
    expect(playerProps()?.previewURL).toBe('https://example.com/A.jpg');

    await advanceMs(2_000);
    expect(playerProps()?.previewURL).toBe('https://example.com/A.jpg');
    await advanceMs(1_500);
    expect(playerProps()?.previewURL).toBe('https://example.com/B.jpg');
  });
});
