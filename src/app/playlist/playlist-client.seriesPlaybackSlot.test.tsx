/** @vitest-environment jsdom */
/**
 * Regressions for feralfile-bot F6, F7 and F8 on PR #320 — three ways the
 * `updateSeriesPlayback` rebuild disturbed playback it was not asked to touch.
 *
 * F6: the rebuild resolved the slot on screen by item id, so an artwork with
 * no `id` — valid per the DP-1 schema — fell to raw index 0 and the command
 * jumped an ordinary playlist back to its first work. The same lookup could
 * not tell two items sharing an id apart either; both are covered here,
 * because resolving the slot positionally is one fix for both.
 *
 * F7: an expanding group earlier in the list shifts every later slot, and the
 * showing key carried that index, so an ended artwork held by repeat-off was
 * remounted and replayed for having moved.
 *
 * F8: the rebuilt list is a fresh array even when nothing was narrowed away,
 * which re-runs the route's slot-entry effect and granted the artwork on
 * screen a whole new interval — a 10s slot asked to change series mode at
 * second 9 advanced at second 19.
 *
 * F9: a queued shuffle publishes its new order onto `castInfo` at once and
 * waits for the slot boundary to install it, so the rebuild narrowed the
 * order waiting to replace the list while indexing it with a position that
 * named a slot of the list on screen — and interrupted an ordinary playlist
 * carrying no series at all.
 *
 * F7 again: the showing key still carried the slot index for an artwork whose
 * id AND source repeat elsewhere in the same playlist, so the first fix left
 * a repeated ended tail being replayed when a series ahead of it expanded.
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
  advanceMs,
  callSourceEnded,
  displayCast,
  item,
  LivePlaylistHarness,
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

const SERIES_ID = '24680';

/** An edition of an already-expanded series, as feral-controld sends it. */
function seriesEdition(id: string, durationSeconds?: number): DP1Item {
  return {
    ...item(id, 1),
    duration: durationSeconds,
    provenance: {
      type: DP1ProvenanceType.OnChain,
      contract: { chain: DP1Chain.EVM, seriesId: SERIES_ID, tokenId: id },
    },
  } as DP1Item;
}

/** A playable item carrying no `id` at all, which DP-1 permits. */
function idlessItem(slug: string, durationSeconds?: number): DP1Item {
  return {
    source: `https://example.com/${slug}.jpg`,
    license: {},
    duration: durationSeconds,
  } as DP1Item;
}

function playerProps(): Record<string, unknown> {
  return (
    (globalThis as { __artworkPlayerProps?: Record<string, unknown> })
      .__artworkPlayerProps ?? {}
  );
}

function shownSource(): string | undefined {
  return playerProps().previewURL as string | undefined;
}

function shownSessionKey(): string | undefined {
  return playerProps().sessionKey as string | undefined;
}

function sendSeriesPlayback(mode: DP1SeriesPlayback): void {
  act(() => {
    canvasService.processMessage({
      command: CastCommand.updateSeriesPlayback,
      request: { mode },
    });
  });
}

function sendShuffle(enabled: boolean): void {
  act(() => {
    canvasService.processMessage({
      command: CastCommand.setShuffle,
      request: { enabled },
    });
  });
}

/** Shared fake-clock and device-override lifecycle for the suites below. */
function useFakeTimersForSlotSuite(): void {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    await DeviceManager.setSeriesPlayback(null);
  });
}

describe('PlaylistClient — updateSeriesPlayback keeps the selected slot', () => {
  useFakeTimersForSlotSuite();

  it('keeps an id-less artwork selected instead of jumping to the first slot', async () => {
    // An ordinary playlist with no series in it at all: the rebuild narrows
    // nothing, so the only thing that can move the selection is how the slot
    // on screen is resolved. The id lookup had no answer for an item without
    // one and fell back to raw index 0.
    const items = [item('a', 100), idlessItem('b', 100)];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.playlist), false);
    render(<LivePlaylistHarness />);

    expect(shownSource()).toBe('https://example.com/b.jpg');

    sendSeriesPlayback(DP1SeriesPlayback.Full);
    await advanceMs(0);

    expect(shownSource()).toBe('https://example.com/b.jpg');
  });

  it('keeps the second of two slots sharing one id selected', async () => {
    // The same lookup's other blind spot: `findIndex` answers with the first
    // match, so the same artwork cast twice sent the selection to the earlier
    // copy. Resolving the slot through the previous narrowing's own reverse
    // map has neither failure mode.
    const items = [
      { ...item('dup', 100), source: 'https://example.com/first.jpg' },
      { ...item('dup', 100), source: 'https://example.com/second.jpg' },
    ] as DP1Item[];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.playlist), false);
    render(<LivePlaylistHarness />);

    expect(shownSource()).toBe('https://example.com/second.jpg');

    sendSeriesPlayback(DP1SeriesPlayback.Full);
    await advanceMs(0);

    expect(shownSource()).toBe('https://example.com/second.jpg');
  });

  it('carries the selected slot across a First -> Full flip of an earlier group', async () => {
    // The positional resolution has to survive the flip that changes the
    // list: raw index 2 is the tail under both modes, but its local index
    // moves from 1 to 2 as the group ahead of it expands.
    await DeviceManager.setSeriesPlayback(DP1SeriesPlayback.First);
    const items = [
      seriesEdition('edition-0', 100),
      seriesEdition('edition-1', 100),
      item('tail', 100),
    ];
    canvasService.setCastInfo(displayCast(items, 2, LoopMode.playlist), false);
    render(<LivePlaylistHarness />);

    expect(shownSource()).toBe('https://example.com/tail.jpg');

    sendSeriesPlayback(DP1SeriesPlayback.Full);
    await advanceMs(0);

    expect(shownSource()).toBe('https://example.com/tail.jpg');
  });
});

describe('PlaylistClient — updateSeriesPlayback keeps the ended tail showing', () => {
  useFakeTimersForSlotSuite();

  it('does not change the showing key when an earlier group expands past a held slot', async () => {
    // The hold resolver already answers `keep` here (the tail is still the
    // last thing to play), but the showing key carried the slot index, so the
    // renderer tore the ended video down and started it over.
    await DeviceManager.setSeriesPlayback(DP1SeriesPlayback.First);
    const items = [
      seriesEdition('edition-0', 1),
      seriesEdition('edition-1', 1),
      { ...item('tail', 1), duration: undefined } as DP1Item,
    ];
    canvasService.setCastInfo(displayCast(items, 2, LoopMode.none), false);
    render(<LivePlaylistHarness />);

    expect(shownSource()).toBe('https://example.com/tail.jpg');
    callSourceEnded(playerProps().itemIdentity as string);
    await advanceMs(0);

    const keyBefore = shownSessionKey();

    sendSeriesPlayback(DP1SeriesPlayback.Full);
    await advanceMs(0);

    // The tail moved from local index 1 to local index 2, and is still the
    // same showing — so the key must not have moved with it.
    expect(shownSource()).toBe('https://example.com/tail.jpg');
    expect(shownSessionKey()).toBe(keyBefore);
  });
});

describe('PlaylistClient — updateSeriesPlayback keeps the running deadline', () => {
  useFakeTimersForSlotSuite();

  it('advances the active slot on its own deadline, not a fresh interval', async () => {
    // Nothing in this playlist narrows, so the command may not change the
    // pacing of the work already on screen: a 10s slot entered at zero still
    // advances at second 10 after a series command at second 9.
    const items = [item('a', 10), item('b', 10)];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.playlist), false);
    render(<LivePlaylistHarness />);

    expect(shownSource()).toBe('https://example.com/a.jpg');
    await advanceMs(9000);
    expect(shownSource()).toBe('https://example.com/a.jpg');

    sendSeriesPlayback(DP1SeriesPlayback.Full);
    await advanceMs(0);

    await advanceMs(1000);
    expect(shownSource()).toBe('https://example.com/b.jpg');
  });

  it('still gives a fresh interval to a slot the rebuild moved onto', async () => {
    // The other edge: when the override really does change what plays, the
    // slot that lands on screen has not been showing since its own entry, so
    // preserving an elapsed deadline would cut it short.
    await DeviceManager.setSeriesPlayback(DP1SeriesPlayback.Full);
    const items = [seriesEdition('edition-0', 10), seriesEdition('edition-1', 10)];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.playlist), false);
    render(<LivePlaylistHarness />);

    expect(shownSource()).toBe('https://example.com/edition-1.jpg');
    await advanceMs(9000);

    // First collapses the group onto edition-0, a slot the viewer has not
    // been watching.
    sendSeriesPlayback(DP1SeriesPlayback.First);
    await advanceMs(0);
    expect(shownSource()).toBe('https://example.com/edition-0.jpg');

    // One second in it is still showing: it got its own 10s, not the 1s
    // left over from the slot it replaced.
    await advanceMs(1000);
    expect(shownSource()).toBe('https://example.com/edition-0.jpg');
  });
});

describe('PlaylistClient — updateSeriesPlayback keeps a queued replacement queued', () => {
  useFakeTimersForSlotSuite();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the artwork on screen when a shuffle is still waiting to apply', async () => {
    // `setShuffle` publishes its new order onto castInfo immediately and
    // leaves it queued until the current slot finishes, so for that whole
    // interval castInfo's order is NOT the order on screen. Resolving the
    // selected slot against castInfo's copy moved an ordinary playlist with
    // no series in it at all (feralfile-bot F9 on #320).
    //
    // Fisher-Yates over the two items that are not current: random >= 0.5
    // leaves them in place, so the queued order is deterministically
    // [b, a, c] — `a` landing exactly where `b`'s own local index pointed.
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const items = [item('a', 100), item('b', 100), item('c', 100)];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.playlist), false);
    render(<LivePlaylistHarness />);

    expect(shownSource()).toBe('https://example.com/b.jpg');

    sendShuffle(true);
    await advanceMs(0);
    expect(shownSource()).toBe('https://example.com/b.jpg');

    sendSeriesPlayback(DP1SeriesPlayback.Full);
    await advanceMs(0);

    expect(shownSource()).toBe('https://example.com/b.jpg');
  });

  it('still applies the queued shuffle at the slot boundary afterwards', async () => {
    // The other half of the same claim: the command may not consume the
    // queue either. `b` holds its own slot to the end, and the shuffled
    // order takes over from there — `a` next, as [b, a, c] says.
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const items = [item('a', 10), item('b', 10), item('c', 10)];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.playlist), false);
    render(<LivePlaylistHarness />);

    sendShuffle(true);
    sendSeriesPlayback(DP1SeriesPlayback.Full);
    await advanceMs(0);
    expect(shownSource()).toBe('https://example.com/b.jpg');

    await advanceMs(10000);
    expect(shownSource()).toBe('https://example.com/a.jpg');
  });
});

describe('PlaylistClient — updateSeriesPlayback keeps a repeated tail showing', () => {
  useFakeTimersForSlotSuite();

  it('does not remount an ended tail that repeats an earlier id and source', async () => {
    // The tail is the same artwork as the group's first edition, cast a
    // second time after a separator. Identity and source alone cannot tell
    // the two slots apart, so the showing key fell back to the slot index —
    // and expansion ahead of the tail moved it, remounting an artwork the
    // hold resolver had just decided to keep (feralfile-bot F7, second pass).
    await DeviceManager.setSeriesPlayback(DP1SeriesPlayback.First);
    const items = [
      seriesEdition('edition-0', 1),
      seriesEdition('edition-1', 1),
      item('separator', 1),
      { ...seriesEdition('edition-0'), duration: undefined } as DP1Item,
    ];
    canvasService.setCastInfo(displayCast(items, 3, LoopMode.none), false);
    render(<LivePlaylistHarness />);

    expect(shownSource()).toBe('https://example.com/edition-0.jpg');
    callSourceEnded(playerProps().itemIdentity as string);
    await advanceMs(0);

    const keyBefore = shownSessionKey();

    sendSeriesPlayback(DP1SeriesPlayback.Full);
    await advanceMs(0);

    // The tail moved from local index 2 to local index 3 and is still the
    // second occurrence of that artwork, so it is still the same showing.
    expect(shownSource()).toBe('https://example.com/edition-0.jpg');
    expect(shownSessionKey()).toBe(keyBefore);
  });

  it('still tells the two occurrences of one artwork apart', async () => {
    // The index was in the key for a reason, and the occurrence has to keep
    // doing that job: advancing from the group's own edition to the repeat
    // of it at the tail is a new showing, not a re-render of the same one.
    await DeviceManager.setSeriesPlayback(DP1SeriesPlayback.First);
    const items = [
      seriesEdition('edition-0', 1),
      item('separator', 1),
      { ...seriesEdition('edition-0'), duration: 1 } as DP1Item,
    ];
    canvasService.setCastInfo(displayCast(items, 0, LoopMode.playlist), false);
    render(<LivePlaylistHarness />);

    const headKey = shownSessionKey();
    await advanceMs(1000);
    expect(shownSource()).toBe('https://example.com/separator.jpg');
    await advanceMs(1000);

    expect(shownSource()).toBe('https://example.com/edition-0.jpg');
    expect(shownSessionKey()).not.toBe(headKey);
  });
});
