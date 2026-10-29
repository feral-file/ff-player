/** @vitest-environment jsdom */
/**
 * Regression for feralfile-bot F4 on PR #320: the `updateSeriesPlayback`
 * cast-command branch cleared `holdAfterFinalSlotRef` unconditionally, on
 * every invocation, including the ones that narrow nothing away and leave
 * both the playable list and the slot on screen exactly as they were.
 *
 * That flag is the only record that repeat-off stopped deliberately on the
 * final artwork, and it is what the two paths able to restart that artwork
 * gate on — `shouldResumeSlotTimerAfterSetLoop` for a later `setLoop` away
 * from `LoopMode.none`, and `shouldApplyQueuedPlaylistOnShuffleOrRefresh`
 * for a queued refresh that would otherwise wait for a slot timer no longer
 * armed. Clearing it on a no-op rebuild therefore stranded the ended slot
 * for good, which the first two cases below prove; the sibling
 * `updateDefaultDuration` branch already documents that it does not do
 * this. The third case holds the other edge: when the override really does
 * change what plays, the hold stops describing anything and must still go.
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

const SERIES_ID = '98765';

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

/** A no-duration item: it ends via onSourceEnded, never via a slot timer. */
function endlessItem(id: string): DP1Item {
  return { ...item(id, 1), duration: undefined } as DP1Item;
}

function reloadCount(): number {
  return (
    (globalThis as { __artworkReloadInvocations?: number })
      .__artworkReloadInvocations ?? 0
  );
}

function shownItemIdentity(): string | undefined {
  return (globalThis as { __artworkPlayerProps?: Record<string, unknown> })
    .__artworkPlayerProps?.itemIdentity as string | undefined;
}

/** Ends the no-duration source on screen, which under repeat-off holds it. */
function endFinalSlot(): void {
  callSourceEnded(shownItemIdentity() ?? '');
}

/** Shared fake-clock and device-override lifecycle for the suites below. */
function useFakeTimersForHoldSuite(): void {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    teardownPlaylistWiringTest();
    await DeviceManager.setSeriesPlayback(null);
  });
}

describe('PlaylistClient — updateSeriesPlayback keeps a hold it did not move', () => {
  useFakeTimersForHoldSuite();

  it('keeps the hold when the rebuild moves nothing, so a later setLoop still restarts the held artwork', async () => {
    // An ordinary playlist: no series item and no expanded group, so
    // narrowSeriesPlaylist collapses nothing and the rebuilt list is
    // content-identical to the one already playing. This is the broadest
    // shape — it needs no series in the playlist at all.
    const items = [item('a', 1), endlessItem('b')];
    const cast = displayCast(items, 1, LoopMode.none);
    canvasService.setCastInfo(cast, false);
    render(<LivePlaylistHarness />);

    endFinalSlot();
    await advanceMs(0);

    act(() => {
      canvasService.processMessage({
        command: CastCommand.updateSeriesPlayback,
        request: { mode: DP1SeriesPlayback.First },
      });
    });
    await advanceMs(0);

    const reloadsBefore = reloadCount();

    act(() => {
      canvasService.processMessage({
        command: CastCommand.setLoop,
        request: { mode: LoopMode.playlist },
      });
    });
    await advanceMs(0);

    expect(reloadCount()).toBe(reloadsBefore + 1);
  });

  it('keeps the hold when the override is re-set to the mode already in effect on a real series group', async () => {
    // Full -> Full over an expanded group: the resolved mode is unchanged,
    // so the rebuild is a no-op even though a series really is present.
    await DeviceManager.setSeriesPlayback(DP1SeriesPlayback.Full);
    const items = [seriesEdition('edition-0', 1), seriesEdition('edition-1')];
    const cast = displayCast(items, 1, LoopMode.none);
    canvasService.setCastInfo(cast, false);
    render(<LivePlaylistHarness />);

    expect(shownItemIdentity()).toBe('edition-1');
    endFinalSlot();
    await advanceMs(0);

    act(() => {
      canvasService.processMessage({
        command: CastCommand.updateSeriesPlayback,
        request: { mode: DP1SeriesPlayback.Full },
      });
    });
    await advanceMs(0);

    const reloadsBefore = reloadCount();

    act(() => {
      canvasService.processMessage({
        command: CastCommand.setLoop,
        request: { mode: LoopMode.one },
      });
    });
    await advanceMs(0);

    expect(reloadCount()).toBe(reloadsBefore + 1);
  });

});

describe('PlaylistClient — updateSeriesPlayback clears a hold it does move', () => {
  useFakeTimersForHoldSuite();

  it('still clears the hold when the override collapses the group and moves the slot', async () => {
    // Full -> First on the same expanded group: the list collapses to the
    // group's first edition and the slot that was held is narrowed away, so
    // the hold no longer describes what is on screen. setLoop must then find
    // nothing to resume rather than reloading a slot the viewer left.
    await DeviceManager.setSeriesPlayback(DP1SeriesPlayback.Full);
    const items = [seriesEdition('edition-0', 1), seriesEdition('edition-1')];
    const cast = displayCast(items, 1, LoopMode.none);
    canvasService.setCastInfo(cast, false);
    render(<LivePlaylistHarness />);

    expect(shownItemIdentity()).toBe('edition-1');
    endFinalSlot();
    await advanceMs(0);

    act(() => {
      canvasService.processMessage({
        command: CastCommand.updateSeriesPlayback,
        request: { mode: DP1SeriesPlayback.First },
      });
    });
    await advanceMs(0);

    expect(shownItemIdentity()).toBe('edition-0');
    const reloadsBefore = reloadCount();

    act(() => {
      canvasService.processMessage({
        command: CastCommand.setLoop,
        request: { mode: LoopMode.playlist },
      });
    });
    await advanceMs(0);

    expect(reloadCount()).toBe(reloadsBefore);
  });
});
