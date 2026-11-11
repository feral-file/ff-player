/**
 * A refresh that grows the playlist, re-sent unchanged, must not leave the
 * wall on the old list: an FF1 kept cycling a 50-item cast while castInfo
 * (and status) held 1535 items, so moveToArtwork(119) reported item 119 and
 * mounted item 119 % 50 = 19. ArtworkPlayer is mocked (as in
 * playlist-client.test.tsx): the decision under test is the timeline's.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import { DP1Action, type DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { prepareContentPolicy } from '@/services/contentPolicy.testkit';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaylistClient from './playlist-client';
import {
  dp1Call,
  item,
  teardownPlaylistWiringTest,
} from './playlist-client.testkit';

beforeEach(prepareContentPolicy);

vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function MockArtworkPlayer(props: Record<string, unknown>) {
    const g = globalThis as { __artworkPlayerProps?: Record<string, unknown> };
    g.__artworkPlayerProps = props;
    return null;
  },
}));

/** The live route: AppContext mirrors canvasService's cast the way the app does. */
function LiveHarness() {
  const [castInfo, setCastInfo] = React.useState(canvasService.getCastInfo());
  React.useEffect(() => {
    canvasService.onCastInfoChange = setCastInfo;
    return () => {
      canvasService.onCastInfoChange = null;
    };
  }, []);
  const value = React.useMemo(
    () => ({
      context: {
        isInitialized: true,
        isOnline: true,
        appRemoteConfig: {},
        displaySettings: null,
        cursorPositions: null,
        castInfo,
      },
    }),
    [castInfo]
  );
  return (
    <AppContext.Provider value={value as never}>
      <PlaylistClient />
    </AppContext.Provider>
  );
}

/** One CDP command per act, the way the daemon delivers them: React renders between commands. */
function send(command: CastCommand, request: unknown) {
  act(() => {
    const reply = canvasService.processMessage({ command, request });
    expect(reply?.ok).toBe(true);
  });
}

function cast(items: DP1Item[], mediaHealth: unknown) {
  send(CastCommand.displayPlaylist, {
    intent: { action: DP1Action.NowDisplay },
    dp1_call: dp1Call('pl', items),
    mediaHealth,
  });
}

const mountedURL = () =>
  (globalThis as { __artworkPlayerProps?: { previewURL?: string } })
    .__artworkPlayerProps?.previewURL;

async function advanceMs(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  teardownPlaylistWiringTest();
  canvasService.disconnect();
});

describe('PlaylistClient after a grown refresh re-sent unchanged', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function growAndResend() {
    const items = [item('a', 60), item('b', 60), item('c', 60)];
    render(<LiveHarness />);
    cast(items, undefined);
    const grown = [...items, item('d', 60), item('e', 60), item('f', 60)];
    for (let i = 0; i < 2; i++) {
      // The refresher re-sends the same grown list on every re-resolve.
      send(CastCommand.displayPlaylist, {
        refresh: true,
        dp1_call: dp1Call('pl', grown),
      });
    }
    return { items, grown };
  }

  it('moves to the work status names, past the old list', async () => {
    const { grown } = growAndResend();
    await advanceMs(0);

    send(CastCommand.moveToArtwork, { index: 4 });
    await advanceMs(0);

    expect(canvasService.getStatus().index).toBe(4);
    expect(mountedURL()).toBe(grown[4].source); // not grown[4 % 3]
  });

  it('keeps the grown list queued for the next boundary', async () => {
    growAndResend();
    await advanceMs(0);

    expect(canvasService.hasQueuedPlaylistPending()).toBe(true);
  });

  it('mounts the replaced source after a cancelled deferred refresh', async () => {
    const items = [item('a', 60), item('b', 60)];
    render(<LiveHarness />);
    cast(items, undefined);
    await advanceMs(0);
    const replaced = [
      items[0],
      { ...items[1], source: 'https://example.com/b-v2.jpg' } as DP1Item,
    ];
    send(CastCommand.displayPlaylist, {
      refresh: true,
      dp1_call: dp1Call('pl', replaced),
    });
    // Removes the work on screen: deferred.
    send(CastCommand.displayPlaylist, {
      refresh: true,
      dp1_call: dp1Call('pl', [item('x', 60), item('y', 60)]),
    });
    // Back to the replaced list: cancels the deferred refresh.
    send(CastCommand.displayPlaylist, {
      refresh: true,
      dp1_call: dp1Call('pl', replaced),
    });

    send(CastCommand.moveToArtwork, { index: 1 });
    await advanceMs(0);

    expect(canvasService.getStatus().items?.[1]?.source).toBe(
      replaced[1].source
    );
    expect(mountedURL()).toBe(replaced[1].source);
  });
});
