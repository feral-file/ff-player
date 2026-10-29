/** @vitest-environment jsdom */
/**
 * Route-level wiring for `seriesPlayback` (run-reviewer F1 on PR #320): the
 * resolution functions in `@/utils/seriesPlayback` existed with no
 * production caller, so neither an item's own `seriesPlayback` nor the
 * device override changed what actually rendered. These drive a real
 * `PlaylistClient` through `castInfo.playlist.items` the way `feral-controld`
 * actually delivers a series — already expanded into plain edition items
 * sharing one `seriesId`, never alongside the replaced `seriesRegistry` item
 * (feral-file/ffos-user#421 `expandSeriesItems`) — and assert on what
 * `ArtworkPlayer` is actually told to show, not on stored state.
 */
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import {
  DP1Chain,
  DP1Item,
  DP1ProvenanceType,
  DP1SeriesPlayback,
} from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { prepareContentPolicy } from '@/services/contentPolicy.testkit';
import DeviceManager from '@/utils/DeviceManager';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LivePlaylistHarness,
  PlaylistHarness,
  advanceMs,
  displayCast,
  item,
  teardownPlaylistWiringTest,
} from './playlist-client.testkit';

beforeEach(prepareContentPolicy);

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function MockArtworkPlayer(props: Record<string, unknown>) {
    (
      globalThis as { __artworkPlayerProps?: Record<string, unknown> }
    ).__artworkPlayerProps = props;
    return null;
  },
}));

// A series feral-controld has already expanded: plain on-chain edition items
// sharing one seriesId, none of them carrying the replaced seriesRegistry
// item's own provenance.type or seriesPlayback (that information is gone
// with it — see narrowSeriesPlaylist's doc comment).
const SERIES_ID = '12345';

function seriesEdition(id: string): DP1Item {
  return {
    ...item(id, 1),
    provenance: {
      type: DP1ProvenanceType.OnChain,
      contract: { chain: DP1Chain.EVM, seriesId: SERIES_ID, tokenId: id },
    },
  };
}

function shownItemIdentity(): string | undefined {
  return (globalThis as { __artworkPlayerProps?: Record<string, unknown> })
    .__artworkPlayerProps?.itemIdentity as string | undefined;
}

function useFakeTimersForSeriesPlayback(): void {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(async () => {
    teardownPlaylistWiringTest();
    await DeviceManager.setSeriesPlayback(null);
  });
}

describe('PlaylistClient — series playback narrowing', () => {
  useFakeTimersForSeriesPlayback();

  it('an already-expanded series defaults to its first edition with no override', () => {
    const editions = [
      seriesEdition('edition-0'),
      seriesEdition('edition-1'),
      seriesEdition('edition-2'),
    ];
    const cast = displayCast(editions, 0, LoopMode.playlist);
    canvasService.setCastInfo(cast, false);
    render(<PlaylistHarness castInfo={cast} />);

    // Three editions reached castInfo, but with no override set the group
    // collapses to the first — the documented default for an absent
    // seriesPlayback, which is all that is left once expansion drops the
    // replaced seriesRegistry item's own stated intent.
    expect(shownItemIdentity()).toBe('edition-0');
  });

  it('a device override set before the cast plays every edition in sequence', async () => {
    await DeviceManager.setSeriesPlayback(DP1SeriesPlayback.Full);
    const editions = [
      seriesEdition('edition-0'),
      seriesEdition('edition-1'),
      seriesEdition('edition-2'),
    ];
    const cast = displayCast(editions, 0, LoopMode.playlist);
    canvasService.setCastInfo(cast, false);
    render(<PlaylistHarness castInfo={cast} />);

    expect(shownItemIdentity()).toBe('edition-0');
    await advanceMs(1000);
    expect(shownItemIdentity()).toBe('edition-1');
    await advanceMs(1000);
    expect(shownItemIdentity()).toBe('edition-2');
  });

  it('flipping the override to Full re-expands without a re-cast, and clearing it collapses back', async () => {
    const editions = [
      seriesEdition('edition-0'),
      seriesEdition('edition-1'),
      seriesEdition('edition-2'),
    ];
    const cast = displayCast(editions, 0, LoopMode.playlist);
    canvasService.setCastInfo(cast, false);
    render(<LivePlaylistHarness />);

    expect(shownItemIdentity()).toBe('edition-0');

    // The acceptance check itself: "Setting the device override changes
    // what plays without a re-cast" — castInfo.playlist.items (what
    // CanvasService actually republishes) never changes; only the
    // narrowing read live off the device override does.
    act(() => {
      canvasService.processMessage({
        command: CastCommand.updateSeriesPlayback,
        request: { mode: DP1SeriesPlayback.Full },
      });
    });
    expect(shownItemIdentity()).toBe('edition-0');
    await advanceMs(1000);
    expect(shownItemIdentity()).toBe('edition-1');

    // A moveToArtwork/updateIndex onto a later raw position in the group
    // (here, CanvasService's own index-echo from the advance above) must
    // land on the edition it names, not snap back to the group's first
    // output slot — the regression narrowSeriesPlaylist's mapIndex had.
    act(() => {
      canvasService.publishIndexUpdate(2);
    });
    expect(shownItemIdentity()).toBe('edition-2');

    // "...and clearing it returns to the item's own intent" — here, the
    // documented First default, since expansion left no stated intent.
    act(() => {
      canvasService.processMessage({
        command: CastCommand.updateSeriesPlayback,
        request: {},
      });
    });
    expect(shownItemIdentity()).toBe('edition-0');
  });
});

describe('PlaylistClient — series playback narrowing: queued/deferred apply and the player\'s own index echo', () => {
  useFakeTimersForSeriesPlayback();

  it('advances past a narrowed series group to the item after it, without oscillating back (run-reviewer F1, round 2)', async () => {
    // The group sits in the middle of the raw playlist, not at raw index 0:
    // narrowSeriesPlaylist collapses it to one slot, so the local playlist
    // ("before", "edition-0", "after") is shorter than castInfo.playlist.items
    // ("before", edition-0..2, "after"). The player's own natural advance must
    // still reach "after", not get re-interpreted as a raw index that lands
    // back inside the collapsed group.
    const items = [
      item('before', 1),
      seriesEdition('edition-0'),
      seriesEdition('edition-1'),
      seriesEdition('edition-2'),
      item('after', 1),
    ];
    const cast = displayCast(items, 0, LoopMode.playlist);
    canvasService.setCastInfo(cast, false);
    render(<LivePlaylistHarness />);

    expect(shownItemIdentity()).toBe('before');
    await advanceMs(1000);
    expect(shownItemIdentity()).toBe('edition-0');
    await advanceMs(1000);
    expect(shownItemIdentity()).toBe('after');
    // One more advance should wrap back to the start, not get stuck
    // oscillating between "edition-0" and a corrupted index.
    await advanceMs(1000);
    expect(shownItemIdentity()).toBe('before');
  });

  it('narrows a series group delivered through the deferred-refresh queue (run-reviewer F2, round 2)', async () => {
    const initial = displayCast([item('current', 1)], 0, LoopMode.playlist);
    canvasService.setCastInfo(initial, false);
    render(<LivePlaylistHarness />);
    expect(shownItemIdentity()).toBe('current');

    // The current item isn't in the new list, so CanvasService.refreshPlaylist
    // defers it (queuedPlaylistPending) rather than swapping immediately —
    // the routine "refresh while something else is on screen" path.
    const refreshed = (
      canvasService as unknown as {
        refreshPlaylist: (items: DP1Item[]) => { ok: boolean };
      }
    ).refreshPlaylist([
      seriesEdition('edition-0'),
      seriesEdition('edition-1'),
      seriesEdition('edition-2'),
    ]);
    expect(refreshed).toEqual({ ok: true });
    expect(canvasService.hasDeferredRefreshPlaylist()).toBe(true);

    // "current"'s own slot timer fires naturally, applying the queued list.
    await advanceMs(1000);

    // With no override, the deferred series group narrows to its first
    // edition instead of installing all three raw editions as separate
    // slots (which would play every edition regardless of the resolved
    // mode).
    expect(shownItemIdentity()).toBe('edition-0');
    await advanceMs(1000);
    expect(shownItemIdentity()).toBe('edition-0');
  });
});
