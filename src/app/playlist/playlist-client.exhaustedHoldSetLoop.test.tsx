/**
 * Regression for run-reviewer bot-round-3 pass-5 F1: `advanceFromSlot`'s
 * `retryOnFinalHold` branch (added to retry in place, rather than park
 * forever, when the failed item is the final/only slot under
 * `LoopMode.none` — see `playlist-client.artworkExhaustion.test.tsx`) never
 * set `holdAfterFinalSlotRef`, unlike its natural-end sibling branch
 * immediately below it. `shouldResumeSlotTimerAfterSetLoop` gates entirely
 * on that flag, so a later `setLoop` command away from `LoopMode.none`
 * silently failed to resume an item that had recovered through a retry
 * cycle on the final slot — exactly the same observable shape
 * `playlist-client.sourceEnd.test.tsx`'s "setLoop after timed hold" suite
 * already proves for a NATURAL end hold.
 */
import { CastCommand } from '@/models';
import type { CastInfo } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { canvasService } from '@/services/CanvasService';
import { render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareContentPolicy } from '@/services/contentPolicy.testkit';

beforeEach(prepareContentPolicy);

import {
  advanceMs,
  callArtworkExhausted,
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

describe('PlaylistClient — setLoop after a retry-held final slot recovers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    teardownPlaylistWiringTest();
  });

  it('restarts a recovered final-slot item when loop toggles back on, same as a natural-end hold', async () => {
    const items = [item('a', 1), item('b', 1)];
    canvasService.setCastInfo(displayCast(items, 1, LoopMode.none), false);
    const { rerender } = render(
      <PlaylistHarness castInfo={displayCast(items, 1, LoopMode.none)} />
    );

    // ArtworkPlayer gives up retrying the final slot's item and calls
    // onArtworkExhausted — the only path that reaches advanceFromSlot's
    // retryOnFinalHold branch. This must leave the final slot held exactly
    // like a natural end does, not merely "functionally parked but not
    // flagged held".
    callArtworkExhausted(items[1].id);

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
