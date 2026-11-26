// @vitest-environment jsdom
/**
 * Route-level timing for durations the player resolves at the point of use
 * (DP-1 core §3.1–§3.2): the held document carries none of the inherited
 * values, so the slot timer must find them itself.
 */
import { LoopMode } from '@/models/cast_info.model';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { prepareContentPolicy } from '@/services/contentPolicy.testkit';
import { render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlaylistHarness,
  advanceMs,
  displayCast,
  teardownPlaylistWiringTest,
} from './playlist-client.testkit';
import { dp1Document, fixtureId } from '@/testing/dp1Fixtures';

beforeEach(prepareContentPolicy);

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: () => null,
}));

const item = (id: string, extra: Partial<DP1Item> = {}): DP1Item => ({
  id: fixtureId(id),
  source: `https://example.com/${id}.jpg`,
  ...extra,
});

/** Casts `items` under `defaults` and mounts the route on that cast. */
function mount(items: DP1Item[], defaults: DP1Call['defaults']) {
  const base = displayCast(items, 0, LoopMode.playlist);
  const cast = {
    ...base,
    playlist: { ...base.playlist, defaults } as DP1Call,
  };
  canvasService.setCastInfo(cast, false);
  return render(<PlaylistHarness castInfo={cast} />);
}

const index = () => canvasService.getCastInfo()?.index;

describe('PlaylistClient — authored durations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('times a slot by override.duration over defaults.duration', async () => {
    mount([item('a', { override: { duration: 2 } }), item('b')], {
      duration: 60,
    });

    await advanceMs(2000);

    expect(index()).toBe(1);
  });

  it('applies refreshed defaults from the next slot on', async () => {
    const items = [item('a'), item('b'), item('c')];
    const { rerender } = mount(items, { duration: 5 });

    (
      canvasService as unknown as {
        refreshPlaylist: (incoming: DP1Call) => unknown;
      }
    ).refreshPlaylist(dp1Document({ items, defaults: { duration: 2 } }));
    rerender(<PlaylistHarness castInfo={canvasService.getCastInfo()} />);

    // The slot on screen keeps the interval it was armed with.
    await advanceMs(5000);
    expect(index()).toBe(1);
    await advanceMs(2000);
    expect(index()).toBe(2);
  });
});
