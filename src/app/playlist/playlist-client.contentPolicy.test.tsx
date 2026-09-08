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

const { getItemRef, unmounted } = vi.hoisted(() => ({ getItemRef: vi.fn(), unmounted: vi.fn() }));
vi.mock('@/services/DP1Service', () => ({ DP1Service: { getItemRef, getPlaylist: vi.fn() } }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock('@/components/artwork-player/ArtworkPlayer', () => ({
  default: function Media({ previewURL }: { previewURL: string }) {
    React.useEffect(() => () => { unmounted(); }, []);
    return <div data-testid="media">{previewURL}</div>;
  },
}));

function Harness({ initial }: { initial: CastInfo | null }) {
  const [castInfo, setCastInfo] = React.useState(initial);
  React.useLayoutEffect(() => {
    canvasService.onCastInfoChange = setCastInfo;
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
});
