// @vitest-environment jsdom
// jsdom (not the node default for .test.ts): the contract under test is
// whether the DisplayDefaultPlaylist window CustomEvent reaches AppContext's
// fallback loop, gated on boot cast hydration.
import { CastCommand } from '@/models';
import { CustomEventName } from '@/models/custom_event';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items: [item('A')],
});

// The hydration gate is one-way per page load by design, so each test gets a
// fresh module registry (and therefore a fresh CanvasService singleton with
// the gate still pending) instead of trying to re-arm a shared instance.
const freshCanvasService = async () => {
  const { canvasService } = await import('./CanvasService');
  return canvasService;
};

const dispatchedEvents = (spy: { mock: { calls: [Event][] } }) =>
  spy.mock.calls.map(([event]) => event.type);

// Boot-order regression for the claim-time push race: castInfo is null while
// AppContext is still restoring persisted cast state, so an onlyIfNoPlaylist
// command answered in that window would arm the fallback and later cast the
// default over the user's restored playlist. The command must defer until
// hydration settles and then re-evaluate against authoritative castInfo.
describe('CanvasService boot cast hydration gate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops a deferred onlyIfNoPlaylist push when hydration restores a playlist', async () => {
    const service = await freshCanvasService();
    const spy = vi.spyOn(window, 'dispatchEvent');

    // Claim-time push lands mid-hydration: accepted but deferred.
    const reply = service.processMessage({
      command: CastCommand.displayDefaultPlaylist,
      request: { onlyIfNoPlaylist: true },
    });
    expect(reply).toEqual({ ok: true });
    expect(dispatchedEvents(spy)).not.toContain(
      CustomEventName.DisplayDefaultPlaylist
    );

    // Boot restore completes with a persisted playlist, then hydration
    // settles: the deferred push must no-op, not stomp the restore.
    service.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('restored'),
        index: 0,
      },
      false
    );
    service.completeBootCastHydration();
    expect(dispatchedEvents(spy)).not.toContain(
      CustomEventName.DisplayDefaultPlaylist
    );
  });

  it('replays a deferred onlyIfNoPlaylist push when hydration restores nothing', async () => {
    const service = await freshCanvasService();
    const spy = vi.spyOn(window, 'dispatchEvent');

    service.processMessage({
      command: CastCommand.displayDefaultPlaylist,
      request: { onlyIfNoPlaylist: true },
    });
    expect(dispatchedEvents(spy)).not.toContain(
      CustomEventName.DisplayDefaultPlaylist
    );

    // Nothing restored: the deferred push must now reach the fallback loop.
    service.completeBootCastHydration();
    expect(dispatchedEvents(spy)).toContain(
      CustomEventName.DisplayDefaultPlaylist
    );
  });

  it('does not defer a forced push during hydration', async () => {
    // A forced default (OOM recovery) is newer intent than any persisted
    // state and must win over a restore — it dispatches immediately.
    const service = await freshCanvasService();
    const spy = vi.spyOn(window, 'dispatchEvent');

    expect(
      service.processMessage({
        command: CastCommand.displayDefaultPlaylist,
        request: {},
      })
    ).toEqual({ ok: true });
    expect(dispatchedEvents(spy)).toContain(
      CustomEventName.DisplayDefaultPlaylist
    );

    // Nothing was deferred, so settling hydration (even twice — the gate is
    // idempotent) must not replay anything: still exactly one dispatch.
    service.completeBootCastHydration();
    service.completeBootCastHydration();
    expect(
      dispatchedEvents(spy).filter(
        type => type === (CustomEventName.DisplayDefaultPlaylist as string)
      )
    ).toHaveLength(1);
  });
});

// A disconnect clears castInfo, so initCastInfo's live-cast bail-out cannot
// see it: at the boot decision, null would read as "nothing happened" and the
// stale persisted state would be restored (or the fallback armed) onto the
// wall the controller just cleared. The flag records the halt for that one
// decision.
describe('CanvasService mid-hydration disconnect flag', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a disconnect while hydration is pending latches the halt flag', async () => {
    const service = await freshCanvasService();
    expect(service.wasHaltedDuringBootHydration()).toBe(false);

    expect(service.disconnect()).toEqual({ ok: true });

    expect(service.wasHaltedDuringBootHydration()).toBe(true);
  });

  it('a disconnect after hydration settles does not latch the flag', async () => {
    // Post-hydration the boot decision has already been made; latching here
    // would be inert but misdescribe history.
    const service = await freshCanvasService();
    service.completeBootCastHydration();

    expect(service.disconnect()).toEqual({ ok: true });

    expect(service.wasHaltedDuringBootHydration()).toBe(false);
  });
});
