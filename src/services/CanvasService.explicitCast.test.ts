// @vitest-environment jsdom
// jsdom (not the node default for .test.ts): the contract under test is the
// ExplicitPlaylistCast window CustomEvent that tells AppContext to cancel an
// active boot-fallback retry.
import { CastCommand } from '@/models';
import { CustomEventName } from '@/models/custom_event';
import { DP1Action, type DP1Call, type DP1Item } from '@/models/dp1.model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';

// Hoisted so the mock fn can be both injected into the module factory and
// configured per test without an unbound method reference off DP1Service.
const { getPlaylistMock } = vi.hoisted(() => ({
  getPlaylistMock: vi.fn<(playlistURL: string) => Promise<DP1Call | null>>(),
}));

vi.mock('./DP1Service', () => ({
  DP1Service: { getPlaylist: getPlaylistMock },
}));

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items: [item('A')],
});

const dispatchedEvents = (spy: { mock: { calls: [Event][] } }) =>
  spy.mock.calls.map(([event]) => event.type);

// An explicit displayPlaylist must announce itself so AppContext can cancel a
// pending boot-fallback retry (otherwise a lingering retry would replace the
// controller's cast with the default playlist). The fallback's OWN cast must
// stay silent: announcing it would cancel a displayDefaultPlaylist request
// that landed while the attempt was in flight — the exact race AppContext's
// nonce guard exists to preserve.
describe('CanvasService explicit-cast signalling', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    vi.restoreAllMocks();
  });

  it('an explicit displayPlaylist dispatches ExplicitPlaylistCast', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');

    const reply = canvasService.processMessage({
      command: CastCommand.displayPlaylist,
      request: {
        intent: { action: DP1Action.NowDisplay },
        dp1_call: playlist('explicit'),
      },
    });

    expect(reply).toEqual({ ok: true });
    expect(dispatchedEvents(spy)).toContain(
      CustomEventName.ExplicitPlaylistCast
    );
  });

  it('the fallback cast never announces itself as an explicit cast', async () => {
    getPlaylistMock.mockResolvedValue(playlist('default'));
    const spy = vi.spyOn(window, 'dispatchEvent');

    await expect(
      canvasService.castPlaylistByURL('https://example.com/default')
    ).resolves.toBe(true);

    expect(dispatchedEvents(spy)).not.toContain(
      CustomEventName.ExplicitPlaylistCast
    );
  });

  it('shouldAbort drops the fallback cast between fetch and commit', async () => {
    // The fetch can be in flight when an explicit cast lands; the abort hook
    // is the only check that runs before the commit inside this method.
    getPlaylistMock.mockResolvedValue(playlist('default'));

    await expect(
      canvasService.castPlaylistByURL('https://example.com/default', () => true)
    ).resolves.toBe(false);

    expect(canvasService.getCastInfo()).toBeNull();
  });
});

// A controller stop must announce itself the same way an explicit cast does,
// or the fallback machinery outlives it: an armed retry or the config-change
// supersede would later cast the default playlist and relight a disconnected
// wall — or navigate a sleeping device back to '/'.
describe('CanvasService playback-halt signalling', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    vi.restoreAllMocks();
  });

  it('disconnect dispatches PlaybackHalted', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');

    expect(canvasService.disconnect()).toEqual({ ok: true });

    expect(dispatchedEvents(spy)).toContain(CustomEventName.PlaybackHalted);
  });

  it('entering sleep dispatches PlaybackHalted', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');

    expect(canvasService.setSleepMode({ sleepMode: true })).toEqual({
      ok: true,
    });

    expect(dispatchedEvents(spy)).toContain(CustomEventName.PlaybackHalted);
  });

  it('waking from sleep does not dispatch PlaybackHalted', () => {
    // Wake resumes playback; announcing a halt here would cancel a
    // displayDefaultPlaylist request racing the wake.
    const spy = vi.spyOn(window, 'dispatchEvent');

    expect(canvasService.setSleepMode({ sleepMode: false })).toEqual({
      ok: true,
    });

    expect(dispatchedEvents(spy)).not.toContain(
      CustomEventName.PlaybackHalted
    );
  });
});
