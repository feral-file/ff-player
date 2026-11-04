/**
 * mediaHealth contract v1 (feral-file/ffos-user#392): the timeline resolves
 * every selection past controld-hinted broken sources BEFORE mounting, keeps
 * the hinted items in the list, publishes where playback really landed, and
 * reports a `skip/hint` outcome per slot passed over. ArtworkPlayer is mocked
 * (as in playlist-client.test.tsx): the decision under test is the
 * timeline's, not the renderer's.
 */
import { AppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import { LoopMode } from '@/models/cast_info.model';
import { DP1Action, type DP1Item } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { prepareContentPolicy } from '@/services/contentPolicy.testkit';
import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlaylistClient from './playlist-client';
import { dp1Call, item, teardownPlaylistWiringTest } from './playlist-client.testkit';

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

const hints = (...items: DP1Item[]) =>
  Object.fromEntries(
    items.map(i => [i.source, { category: 'source_missing', reason: '404' }])
  );

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

// The ring lives on the CanvasService singleton for the whole file, so each
// test reads only what was recorded after its own start.
let mark = 0;
const skipEntries = () =>
  canvasService
    .getStatus()
    .outcomes?.entries.filter(
      entry => entry.seq > mark && entry.stage === 'hint'
    ) ?? [];

async function advanceMs(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  teardownPlaylistWiringTest();
  canvasService.disconnect();
});

describe('PlaylistClient honours mediaHealth hints', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mark = canvasService.getStatus().outcomes?.entries.at(-1)?.seq ?? 0;
  });

  it('starts on the next playable work when the cast lands on a hinted one', async () => {
    const items = [item('broken', 5), item('fine', 5)];
    render(<LiveHarness />);
    cast(items, hints(items[0]));
    await advanceMs(0);

    expect(mountedURL()).toBe(items[1].source);
    expect(canvasService.getStatus().index).toBe(1);
    expect(canvasService.getStatus().items?.map(i => i.id)).toEqual([
      'broken',
      'fine',
    ]);
    expect(skipEntries().map(entry => entry.source)).toEqual([items[0].source]);
    expect(skipEntries()[0]).toMatchObject({
      kind: 'skip',
      attempt: 0,
      elapsedMs: 0,
    });
  });

  it('passes over hinted works on advance and reports each one once', async () => {
    const items = [item('a', 1), item('b', 1), item('c', 1), item('d', 1)];
    render(<LiveHarness />);
    cast(items, hints(items[1], items[2]));
    await advanceMs(0);
    expect(mountedURL()).toBe(items[0].source);

    await advanceMs(1000);
    expect(mountedURL()).toBe(items[3].source);
    expect(canvasService.getStatus().index).toBe(3);
    expect(skipEntries().map(entry => entry.source)).toEqual([
      items[1].source,
      items[2].source,
    ]);
  });

  it('lands an explicit move onto a hinted work on the next playable one', async () => {
    const items = [item('a', 5), item('broken', 5), item('c', 5)];
    render(<LiveHarness />);
    cast(items, hints(items[1]));
    await advanceMs(0);
    expect(mountedURL()).toBe(items[0].source);

    send(CastCommand.moveToArtwork, { index: 1 });
    await advanceMs(0);
    expect(mountedURL()).toBe(items[2].source);
    expect(canvasService.getStatus().index).toBe(2);
    expect(skipEntries().map(entry => entry.source)).toEqual([items[1].source]);
  });

});

describe('PlaylistClient resolves hints on queued and replaced lists', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mark = canvasService.getStatus().outcomes?.entries.at(-1)?.seq ?? 0;
  });

  it('promotes a queued refresh onto the first unhinted slot after the current work', async () => {
    const items = [item('a', 1), item('b', 1)];
    render(<LiveHarness />);
    cast(items, undefined);
    await advanceMs(0);
    expect(mountedURL()).toBe(items[0].source);

    const refreshed = [item('a', 1), item('x', 1), item('c', 1)];
    send(CastCommand.displayPlaylist, {
      refresh: true,
      dp1_call: dp1Call('pl', refreshed),
      mediaHealth: hints(refreshed[1]),
    });
    await advanceMs(0);
    expect(mountedURL()).toBe(items[0].source);

    await advanceMs(1000);
    expect(mountedURL()).toBe(refreshed[2].source);
    expect(canvasService.getStatus().index).toBe(2);
    expect(canvasService.getStatus().items?.map(i => i.id)).toEqual([
      'a',
      'x',
      'c',
    ]);
    expect(skipEntries().map(entry => entry.source)).toEqual([
      refreshed[1].source,
    ]);
  });

  it('hands a same-id source replacement that is hinted over to the next playable slot', async () => {
    const items = [item('a', 5), item('b', 5)];
    render(<LiveHarness />);
    cast(items, undefined);
    await advanceMs(0);
    expect(mountedURL()).toBe(items[0].source);

    const swapped = {
      ...item('a', 5),
      source: 'https://example.com/a-v2.jpg',
    } as DP1Item;
    send(CastCommand.displayPlaylist, {
      refresh: true,
      dp1_call: dp1Call('pl', [swapped, items[1]]),
      mediaHealth: hints(swapped),
    });
    await advanceMs(0);

    expect(mountedURL()).toBe(items[1].source);
    expect(canvasService.getStatus().index).toBe(1);
    expect(skipEntries().map(entry => entry.source)).toEqual([swapped.source]);
  });
});

describe('PlaylistClient tolerates hints it cannot honour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mark = canvasService.getStatus().outcomes?.entries.at(-1)?.seq ?? 0;
  });

  it('tolerates an all-broken map by playing the requested slot', async () => {
    const items = [item('a', 5), item('b', 5)];
    render(<LiveHarness />);
    cast(items, hints(...items));
    await advanceMs(0);

    expect(mountedURL()).toBe(items[0].source);
    expect(canvasService.getStatus().index).toBe(0);
    expect(skipEntries()).toEqual([]);
  });

  it('ignores hints under repeat-one', async () => {
    const items = [item('broken', 1), item('fine', 1)];
    render(<LiveHarness />);
    cast(items, hints(items[0]));
    await advanceMs(0);
    expect(mountedURL()).toBe(items[1].source);
    send(CastCommand.setLoop, { mode: LoopMode.one });
    await advanceMs(0);
    send(CastCommand.moveToArtwork, { index: 0 });
    await advanceMs(0);

    expect(mountedURL()).toBe(items[0].source);
    await advanceMs(1000);
    expect(mountedURL()).toBe(items[0].source);
    expect(skipEntries().map(entry => entry.source)).toEqual([items[0].source]);
  });

  it('plays a hinted tail under repeat-off instead of wrapping', async () => {
    const items = [item('a', 1), item('broken', 1)];
    render(<LiveHarness />);
    cast(items, hints(items[1]));
    await advanceMs(0);
    send(CastCommand.setLoop, { mode: LoopMode.none });
    await advanceMs(0);

    await advanceMs(1000);
    expect(mountedURL()).toBe(items[1].source);
    expect(skipEntries()).toEqual([]);
  });

  it('forgets the hints once a cast arrives without them', async () => {
    const items = [item('broken', 5), item('fine', 5)];
    render(<LiveHarness />);
    cast(items, hints(items[0]));
    await advanceMs(0);
    expect(mountedURL()).toBe(items[1].source);

    cast(items, undefined);
    await advanceMs(0);
    expect(mountedURL()).toBe(items[0].source);
  });
});
