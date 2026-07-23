// @vitest-environment jsdom
// jsdom (not the node default for .test.ts): displayDefaultPlaylist's whole
// contract is a window CustomEvent dispatch to AppContext's fallback loop.
import { CastCommand } from '@/models';
import { CustomEventName } from '@/models/custom_event';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasService } from './CanvasService';

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string, items: DP1Item[]): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items,
});

const displayingCastInfo = () => {
  canvasService.setCastInfo(
    {
      castCommand: CastCommand.displayPlaylist,
      playlist: playlist('live', ['A'].map(item)),
      index: 0,
    },
    false
  );
};

const send = (request?: object) =>
  canvasService.processMessage({
    command: CastCommand.displayDefaultPlaylist,
    request,
  });

const dispatchedEvents = (spy: { mock: { calls: [Event][] } }) =>
  spy.mock.calls.map(([event]) => event.type);

// displayDefaultPlaylist must never resolve the playlist URL itself — it
// delegates to AppContext's fallback loop via the DisplayDefaultPlaylist
// event so a controld-pushed default and the player's own pull share one
// playlist source. `onlyIfNoPlaylist` (claim-time push) no-ops when content
// is already on screen; the bare command (OOM recovery) always forces.
describe('CanvasService displayDefaultPlaylist', () => {
  beforeEach(() => {
    // These tests cover POST-hydration semantics; the boot-hydration gate
    // (one-way per page load) is exercised in CanvasService.bootHydration
    // tests. Settle it up front (idempotent across this file's tests).
    canvasService.completeBootCastHydration();
  });

  afterEach(() => {
    canvasService.setCastInfo(null, false);
    vi.restoreAllMocks();
  });

  it('dispatches the fallback request event on a force push', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');

    expect(send({})).toEqual({ ok: true });

    expect(dispatchedEvents(spy)).toContain(
      CustomEventName.DisplayDefaultPlaylist
    );
  });

  it('force push dispatches even while a playlist is displaying (OOM recovery)', () => {
    displayingCastInfo();
    const spy = vi.spyOn(window, 'dispatchEvent');

    expect(send()).toEqual({ ok: true });

    expect(dispatchedEvents(spy)).toContain(
      CustomEventName.DisplayDefaultPlaylist
    );
  });

  it('onlyIfNoPlaylist no-ops when a playlist is already displaying', () => {
    displayingCastInfo();
    const spy = vi.spyOn(window, 'dispatchEvent');

    expect(send({ onlyIfNoPlaylist: true })).toEqual({ ok: true });

    expect(dispatchedEvents(spy)).not.toContain(
      CustomEventName.DisplayDefaultPlaylist
    );
  });

  it('onlyIfNoPlaylist dispatches when nothing is displaying', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');

    expect(send({ onlyIfNoPlaylist: true })).toEqual({ ok: true });

    expect(dispatchedEvents(spy)).toContain(
      CustomEventName.DisplayDefaultPlaylist
    );
  });
});
