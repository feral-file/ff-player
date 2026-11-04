/**
 * A slot timer that expires while its work is still loading must not
 * advance past a work that never reached the wall: the timer starts at
 * selection, so on a slow link a large work used to be skipped every time.
 * See slotExpiry.ts for the rule. ArtworkPlayer is mocked; its lifecycle is
 * driven through Canvas's render status, which is what the timeline reads.
 */
import { LoopMode } from '@/models/cast_info.model';
import { RenderStatus } from '@/models';
import { canvasService } from '@/services/CanvasService';
import { prepareContentPolicy } from '@/services/contentPolicy.testkit';
import { render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advanceMs,
  displayCast,
  item,
  PlaylistHarness,
  teardownPlaylistWiringTest,
} from './playlist-client.testkit';
import { SLOT_EXPIRY_MAX_DEFER_MS } from './slotExpiry';

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function MockArtworkPlayer(props: Record<string, unknown>) {
    (globalThis as { __artworkPlayerProps?: Record<string, unknown> })
      .__artworkPlayerProps = props;
    return null;
  },
}));

beforeEach(prepareContentPolicy);

function index() {
  return canvasService.getCastInfo()?.index;
}

/** The renderer is loading a work whose watchdog will end a stuck load. */
function holdBoundedLoad() {
  canvasService.setRenderStatus(RenderStatus.loading);
  canvasService.setRenderLoadBounded(true);
}

function startTenSecondPlaylist() {
  const items = [item('a', 10), item('b', 10)];
  const cast = displayCast(items, 0, LoopMode.playlist);
  canvasService.setCastInfo(cast, false);
  render(<PlaylistHarness castInfo={cast} />);
}

describe('PlaylistClient — slot expiry while the work is still loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    canvasService.setRenderStatus(undefined);
    canvasService.setRenderLoadBounded(false);
    teardownPlaylistWiringTest();
  });

  it('advances on time when the work is already on the wall', async () => {
    startTenSecondPlaylist();
    canvasService.setRenderStatus(RenderStatus.ready);

    await advanceMs(10000);
    expect(index()).toBe(1);
  });

  it('holds a loading work past its duration, then gives it a full slot once ready', async () => {
    startTenSecondPlaylist();
    holdBoundedLoad();

    await advanceMs(25000);
    expect(index()).toBe(0);

    canvasService.setRenderStatus(RenderStatus.ready);
    await advanceMs(1000);
    expect(index()).toBe(0);
    await advanceMs(9000);
    expect(index()).toBe(0);
    await advanceMs(1000);
    expect(index()).toBe(1);
  });

  it('advances as before once a held work fails', async () => {
    startTenSecondPlaylist();
    holdBoundedLoad();

    await advanceMs(15000);
    expect(index()).toBe(0);

    canvasService.setRenderStatus(RenderStatus.failed);
    await advanceMs(1000);
    expect(index()).toBe(1);
  });

  it('does not hold for pending, which no renderer may ever answer', async () => {
    startTenSecondPlaylist();
    canvasService.setRenderStatus(RenderStatus.pending);

    await advanceMs(10000);
    expect(index()).toBe(1);
  });

  it('keeps stream pacing: an unbounded load (HLS) advances on time', async () => {
    startTenSecondPlaylist();
    canvasService.setRenderStatus(RenderStatus.loading);
    canvasService.setRenderLoadBounded(false);

    await advanceMs(10000);
    expect(index()).toBe(1);
  });

  it('stops holding after the bounded wait', async () => {
    startTenSecondPlaylist();
    holdBoundedLoad();

    await advanceMs(10000 + SLOT_EXPIRY_MAX_DEFER_MS - 1000);
    expect(index()).toBe(0);
    await advanceMs(2000);
    expect(index()).toBe(1);
  });
});
