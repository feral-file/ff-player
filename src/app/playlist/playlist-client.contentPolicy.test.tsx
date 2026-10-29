/** @vitest-environment jsdom */
import * as React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '@/context/AppContext';
import { CastCommand } from '@/models';
import { CastInfo } from '@/models/cast_info.model';
import { DP1Action, DP1Item, DP1License } from '@/models/dp1.model';
import { canvasService } from '@/services/CanvasService';
import { contentPolicyStore } from '@/services/ContentPolicyStore';
import { DEFAULT_CONTENT_POLICY } from '@/services/contentPolicy';
import { prepareContentPolicy } from '@/services/contentPolicy.testkit';
import PlaylistClient from './playlist-client';

const { getItemRef, unmounted, onCastInfo } = vi.hoisted(() => ({
  getItemRef: vi.fn(), unmounted: vi.fn(), onCastInfo: vi.fn() }));
vi.mock('@/services/DP1Service', () => ({ DP1Service: { getItemRef, getPlaylist: vi.fn() } }));
// Reports a visual commit on mount, the way ArtworkPlayer does once media is
// ready. Without it nothing is ever on screen and the on-screen-vs-selected
// paths under test cannot be reached at all.
vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function Media({ previewURL, itemIdentity, onItemCommitted }: {
    previewURL: string; itemIdentity?: string;
    onItemCommitted?: (identity: string) => void;
  }) {
    React.useEffect(() => () => { unmounted(); }, []);
    React.useEffect(() => {
      onItemCommitted?.(itemIdentity ?? '');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewURL]);
    return <div data-testid="media">{previewURL}</div>;
  },
}));

function Harness({ initial }: { initial: CastInfo | null }) {
  const [castInfo, setCastInfo] = React.useState(initial);
  React.useLayoutEffect(() => {
    canvasService.onCastInfoChange = next => { onCastInfo(next); setCastInfo(next); };
    return () => { canvasService.onCastInfoChange = null; };
  }, []);
  const value = { context: { isInitialized: true, isOnline: true,
    appRemoteConfig: {}, displaySettings: null, cursorPositions: null, castInfo } };
  return <AppContext.Provider value={value as never}><PlaylistClient /></AppContext.Provider>;
}

const mature: DP1Item = { id: 'a', source: 'https://art.test/a',
  contentRating: 'mature', license: DP1License.Open, duration: 60 };
const cast = (item: DP1Item, personal = false): CastInfo => ({
  castCommand: CastCommand.displayPlaylist,
  contentContext: personal ? 'personal' : 'curated', index: 0,
  playlist: { dpVersion: '1.1.0', title: 'Art', items: [item] },
});

beforeEach(prepareContentPolicy);
afterEach(() => { cleanup(); canvasService.setCastInfo(null, false); vi.useRealTimers(); });

describe('playlist content policy media boundary', () => {
  it('never mounts blocked media or requests its manifest, even from stale app state', async () => {
    const initial = cast({ ...mature, ref: 'https://art.test/ref.json' });
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('media')).toBeNull();
    expect(getItemRef).not.toHaveBeenCalled();
  });

  it('unmounts a personal mature work when strict filtering turns on', async () => {
    const initial = cast(mature, true);
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media').textContent).toBe(mature.source);
    await act(async () => {
      await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, strictPersonal: true });
    });
    expect(screen.queryByTestId('media')).toBeNull();
    expect(unmounted).toHaveBeenCalled();
    expect(canvasService.getCastInfo()).toBeNull();
  });

  it('removes already-playing unrated work when fresh labels exclude it', async () => {
    const unrated = { ...mature };
    delete unrated.contentRating;
    const initial = cast(unrated);
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media')).toBeDefined();
    await act(async () => {
      canvasService.processMessage({ command: CastCommand.displayPlaylist,
        request: { intent: { action: DP1Action.NowDisplay }, refresh: true,
          dp1_call: cast(mature).playlist } });
      await Promise.resolve();
    });
    expect(screen.queryByTestId('media')).toBeNull();
    expect(unmounted).toHaveBeenCalled();
  });

  it('does not reload allowed artwork when an unrelated setting changes', async () => {
    const allowed: DP1Item = { id: 'a', source: 'https://art.test/a',
      contentRating: 'general', license: DP1License.Open, duration: 60 };
    const initial = cast(allowed);
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media')).toBeDefined();
    unmounted.mockClear();

    await act(async () => {
      await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });
    });

    // The work is still allowed. Remounting on every policy write reloaded it
    // on screen and recommitted it, appending a duplicate history record for a
    // work that never left the wall.
    expect(screen.getByTestId('media').textContent).toBe(allowed.source);
    expect(unmounted).not.toHaveBeenCalled();
  });

  it('keeps the renderer mounted through an ordinary slot handoff', async () => {
    vi.useFakeTimers();
    const first: DP1Item = { id: 'first', source: 'https://art.test/first',
      contentRating: 'general', license: DP1License.Open, duration: 1 };
    const second: DP1Item = { id: 'second', source: 'https://art.test/second',
      contentRating: 'general', license: DP1License.Open, duration: 1 };
    const initial: CastInfo = { castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated', index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Art', items: [first, second] } };
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media').textContent).toBe(first.source);
    unmounted.mockClear();

    // Let the first slot's timer expire so the playlist advances on its own.
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    // An advance publishes the new index before the effect publishes the new
    // preview URL. The gate must still recognise the outgoing work during that
    // render; unmounting here would drop the crossfade and reload the player
    // on every ordinary advance.
    expect(screen.getByTestId('media').textContent).toBe(second.source);
    expect(unmounted).not.toHaveBeenCalled();
  });
});

describe('same-id source refresh', () => {
  it('installs a new source for the current work without blanking the wall', async () => {
    const v1: DP1Item = { id: 'a', source: 'https://art.test/a-v1',
      contentRating: 'general', license: DP1License.Open };
    const initial: CastInfo = { castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated', index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Art', items: [v1] } };
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media').textContent).toBe(v1.source);

    // Untimed work: there is no later slot advance to install a deferred
    // replacement, so a refresh that keeps the id and changes the source has
    // to hand over immediately or the wall goes dark indefinitely.
    await act(async () => {
      canvasService.processMessage({ command: CastCommand.displayPlaylist,
        request: { intent: { action: DP1Action.NowDisplay }, refresh: true,
          dp1_call: { dpVersion: '1.1.0', title: 'Art',
            items: [{ ...v1, source: 'https://art.test/a-v2' }] } } });
      await Promise.resolve();
    });

    expect(screen.queryByTestId('media')).not.toBeNull();
    expect(screen.getByTestId('media').textContent).toBe('https://art.test/a-v2');
  });
});

describe('policy change during a delayed transition', () => {
  it('retires the work on screen, not the one selected ahead of it', async () => {
    // The mock renderer never reports a commit for the second work, so the
    // first stays on screen exactly as ArtworkPlayer would keep it there
    // while the incoming slot loads.
    const onScreen: DP1Item = { id: 'on-screen', source: 'https://art.test/on-screen',
      license: DP1License.Open, duration: 1 };
    const selected: DP1Item = { id: 'selected', source: 'https://art.test/selected',
      contentRating: 'general', license: DP1License.Open, duration: 1 };
    const initial: CastInfo = { castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated', index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Art', items: [onScreen, selected] } };
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media').textContent).toBe(onScreen.source);

    // Tighten so the on-screen (unrated) work is blocked while the selected one
    // stays allowed. Gating on the selection would authorise the allowed work
    // and leave the blocked one on screen until it loads — indefinitely if it
    // stalls.
    await act(async () => {
      await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });
    });

    expect(screen.queryByTestId('media')?.textContent).not.toBe(onScreen.source);
  });
});

describe('a policy write that changes nothing on screen', () => {
  it('does not restart the current slot or re-resolve its display preference', async () => {
    vi.useFakeTimers();
    const allowed: DP1Item = { id: 'a', source: 'https://art.test/a',
      contentRating: 'general', license: DP1License.Open, duration: 10 };
    const initial: CastInfo = { castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated', index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Art', items: [allowed] } };
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media').textContent).toBe(allowed.source);
    const castsBefore = onCastInfo.mock.calls.length;

    // An unrelated setting changes and the projection is identical to what is
    // playing. Re-issuing displayPlaylist would rebuild the route's item array
    // and re-arm the slot timer, restarting the artwork the viewer is watching.
    await act(async () => {
      await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, strictPersonal: true });
    });

    expect(onCastInfo.mock.calls.length).toBe(castsBefore);
    expect(screen.getByTestId('media').textContent).toBe(allowed.source);
    expect(unmounted).not.toHaveBeenCalled();
  });
});

describe('policy retiring the on-screen work mid-transition', () => {
  it('ends up showing the allowed replacement, never a stuck black wall', async () => {
    const onScreen: DP1Item = { id: 'on-screen', source: 'https://art.test/on-screen',
      license: DP1License.Open, duration: 1 };
    const allowed: DP1Item = { id: 'allowed', source: 'https://art.test/allowed',
      contentRating: 'general', license: DP1License.Open, duration: 1 };
    const initial: CastInfo = { castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated', index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Art', items: [onScreen, allowed] } };
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media').textContent).toBe(onScreen.source);

    // Block the on-screen (unrated) work while the other stays allowed. The gate
    // judges that work, so if its record outlived it the wall would stay
    // black: no player mounted means no commit to replace the owner. This
    // asserts the outcome; the owner is also dropped explicitly in the client
    // so the recovery does not depend on the selection happening to pass
    // through the blocked item first.
    await act(async () => {
      await contentPolicyStore.set({ ...DEFAULT_CONTENT_POLICY, blockUnratedCurated: true });
    });

    expect(screen.queryByTestId('media')).not.toBeNull();
    expect(screen.getByTestId('media').textContent).toBe(allowed.source);
  });
});

describe('cross-playlist handoff', () => {
  it('keeps the outgoing renderer through an ordinary playlist replacement', async () => {
    const a: DP1Item = { id: 'a', source: 'https://art.test/a',
      contentRating: 'general', license: DP1License.Open };
    const b: DP1Item = { id: 'b', source: 'https://art.test/b',
      contentRating: 'general', license: DP1License.Open };
    const initial: CastInfo = { castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated', index: 0,
      playlist: { dpVersion: '1.1.0', title: 'Art', items: [a] } };
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    unmounted.mockClear();

    await act(async () => {
      canvasService.setCastInfo({ ...initial,
        playlist: { dpVersion: '1.1.0', title: 'Art', items: [b] } }, true);
      await Promise.resolve();
    });

    // The outgoing work is absent from the incoming cast, which is what an
    // ordinary handoff looks like — the two-slot transition loads B while A is
    // still shown. Unmounting here makes every replacement a hard cut.
    expect(unmounted).not.toHaveBeenCalled();
    expect(screen.getByTestId('media').textContent).toBe(b.source);
  });

  it('renders the selection the controller reports after a reordering refresh', async () => {
    const a: DP1Item = { id: 'a', source: 'https://art.test/a',
      contentRating: 'general', license: DP1License.Open };
    const b: DP1Item = { id: 'b', source: 'https://art.test/b',
      contentRating: 'general', license: DP1License.Open };
    const initial: CastInfo = { castCommand: CastCommand.displayPlaylist,
      contentContext: 'curated', index: 1,
      playlist: { dpVersion: '1.1.0', title: 'Art', items: [a, b] } };
    canvasService.setCastInfo(initial, false);
    render(<Harness initial={initial} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('media').textContent).toBe(b.source);

    // b keeps its id, gets a new source, and moves to the front. Canvas remaps
    // the selection to index 0; installing the list without that index would
    // render a while the controller reports b.
    await act(async () => {
      canvasService.processMessage({ command: CastCommand.displayPlaylist,
        request: { intent: { action: DP1Action.NowDisplay }, refresh: true,
          dp1_call: { dpVersion: '1.1.0', title: 'Art',
            items: [{ ...b, source: 'https://art.test/b-v2' }, a] } } });
      await Promise.resolve();
    });

    expect(screen.getByTestId('media').textContent).toBe('https://art.test/b-v2');
  });
});
