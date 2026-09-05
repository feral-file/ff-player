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
import type { DP1Defaults, DP1DisplayPreference } from '@/models/dp1.model';
import { Scaling } from '@/models/dp1.model';
import type { DisplaySettings } from '@/models/display_settings.model';
import { canvasService } from '@/services/CanvasService';
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

function playerProps(): Record<string, unknown> | undefined {
  return (globalThis as { __artworkPlayerProps?: Record<string, unknown> })
    .__artworkPlayerProps;
}

function renderedPreference(): DP1DisplayPreference | undefined {
  return playerProps()?.displayPreferences as DP1DisplayPreference | undefined;
}

function cast(defaults?: Partial<DP1Defaults>): CastInfo {
  return {
    castCommand: CastCommand.displayPlaylist,
    playlist: {
      ...dp1Call('pl', [item('A', 30), item('B', 30)]),
      defaults,
    } as never,
    index: 0,
    loopMode: LoopMode.playlist,
  };
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
