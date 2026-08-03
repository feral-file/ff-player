// @vitest-environment jsdom
// jsdom (not the node default for .test.ts): getStatus() and
// __ffosPlayerStatus both read `window` directly (location.pathname,
// __ffosDocStamp), and bootHydrationState()'s 'pending' value can only be
// observed before completeBootCastHydration ever runs on the module's
// singleton — hence the fresh-module-per-test pattern shared with
// CanvasService.bootHydration.test.ts.
import { CastCommand } from '@/models';
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

const freshCanvasService = async () => {
  vi.resetModules();
  const { canvasService: fresh } = await import('./CanvasService');
  return fresh;
};

const service = canvasService as unknown as {
  onRefreshArtwork: (() => boolean) | null;
};

describe('CanvasService hasActiveArtwork', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
  });

  it('is false with no cast', () => {
    expect(canvasService.hasActiveArtwork()).toBe(false);
  });

  it('mirrors refreshArtwork\'s check once a playlist is cast', () => {
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A'].map(item)),
        index: 0,
      },
      false
    );
    expect(canvasService.hasActiveArtwork()).toBe(true);
  });

  it('is false for a cast with an empty item list', () => {
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('empty', []),
        index: 0,
      },
      false
    );
    expect(canvasService.hasActiveArtwork()).toBe(false);
  });
});

describe('CanvasService bootHydrationState', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports pending before hydration settles', async () => {
    const service = await freshCanvasService();
    expect(service.bootHydrationState()).toBe('pending');
  });

  it('reports ok once hydration settles cleanly', async () => {
    const service = await freshCanvasService();
    service.completeBootCastHydration('ok');
    expect(service.bootHydrationState()).toBe('ok');
  });

  it('reports ok when completeBootCastHydration is called with no outcome', async () => {
    const service = await freshCanvasService();
    service.completeBootCastHydration();
    expect(service.bootHydrationState()).toBe('ok');
  });

  it('reports failed only after settling with the failed outcome', async () => {
    const service = await freshCanvasService();
    // Still pending: a 'failed' outcome not yet applied must not leak early.
    expect(service.bootHydrationState()).toBe('pending');
    service.completeBootCastHydration('failed');
    expect(service.bootHydrationState()).toBe('failed');
  });

  it('reports halted_cleared for a mid-hydration disconnect', async () => {
    const service = await freshCanvasService();
    service.disconnect();
    service.completeBootCastHydration('ok');
    expect(service.bootHydrationState()).toBe('halted_cleared');
  });

  it('reports halted_preserving for a mid-hydration sleep', async () => {
    const service = await freshCanvasService();
    service.setSleepMode({ sleepMode: true });
    service.completeBootCastHydration('ok');
    expect(service.bootHydrationState()).toBe('halted_preserving');
  });

  it('prefers failed over a halt latched in the same hydration window', async () => {
    // Ordering per the design's precedence: a halt landed, but the boot
    // catch also recorded initCastInfo throwing — 'failed' still wins
    // because it is the value that feeds boot recovery's destructive row.
    const service = await freshCanvasService();
    service.disconnect();
    service.completeBootCastHydration('failed');
    expect(service.bootHydrationState()).toBe('failed');
  });
});

describe('CanvasService getStatus stamp echo', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    delete (window as unknown as { __ffosDocStamp?: string }).__ffosDocStamp;
  });

  // The key is always present from this (current) player — '' before the
  // session stamps the document. Absence is the OLD-player wire case, which
  // this getter cannot produce and so has no test here.
  it('reports an empty stamp when the global has not been set', () => {
    const status = canvasService.getStatus();
    expect(status.stamp).toBe('');
    expect(JSON.parse(JSON.stringify(status))).toHaveProperty('stamp', '');
  });

  it('echoes window.__ffosDocStamp when present', () => {
    (window as unknown as { __ffosDocStamp?: string }).__ffosDocStamp =
      'gen-42';
    const status = canvasService.getStatus();
    expect(status.stamp).toBe('gen-42');
  });
});

describe('CanvasService pendingRefreshArtwork parking and supersession', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    service.onRefreshArtwork = null;
  });

  it('parks preview_update_failed refusals for replay, like handler_pending', () => {
    const refreshSpy = vi.fn(() => false);
    service.onRefreshArtwork = refreshSpy;

    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A'].map(item)),
        index: 0,
      },
      false
    );

    const reply = canvasService.processMessage({
      command: CastCommand.refreshArtwork,
      request: {},
    });
    expect(reply).toEqual({
      ok: false,
      error: 'Playlist handler could not update preview URL',
      code: 'preview_update_failed',
    });

    // Re-registering a handler that succeeds replays the parked refusal.
    const laterSpy = vi.fn(() => true);
    service.onRefreshArtwork = laterSpy;
    expect(laterSpy).toHaveBeenCalledTimes(1);
  });

  it('a non-null cast change clears a parked refresh of the previous artwork', () => {
    service.onRefreshArtwork = null;

    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('old', ['A'].map(item)),
        index: 0,
      },
      false
    );
    expect(
      canvasService.processMessage({
        command: CastCommand.refreshArtwork,
        request: {},
      })
    ).toEqual({
      ok: false,
      error: 'No playlist handler registered yet',
      code: 'handler_pending',
    });

    // A new cast supersedes the parked refresh: registering a handler now
    // must NOT replay it against the new artwork.
    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('new', ['B'].map(item)),
        index: 0,
      },
      false
    );
    const laterSpy = vi.fn(() => true);
    service.onRefreshArtwork = laterSpy;
    expect(laterSpy).not.toHaveBeenCalled();
  });
});

describe('CanvasService pendingRefreshArtwork — narrowed clear (same-playlist mutations)', () => {
  afterEach(() => {
    canvasService.setCastInfo(null, false);
    service.onRefreshArtwork = null;
  });

  it('a bare connect does not clear a parked refresh (same playlist)', () => {
    service.onRefreshArtwork = null;

    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A'].map(item)),
        index: 0,
      },
      false
    );
    expect(
      canvasService.processMessage({
        command: CastCommand.refreshArtwork,
        request: {},
      })
    ).toEqual({
      ok: false,
      error: 'No playlist handler registered yet',
      code: 'handler_pending',
    });

    // connect passes `{...this.castInfo, castCommand: connect}` through
    // setCastInfo — the same playlist, so the parked refresh must survive.
    canvasService.processMessage({ command: CastCommand.connect, request: {} });

    const laterSpy = vi.fn(() => true);
    service.onRefreshArtwork = laterSpy;
    expect(laterSpy).toHaveBeenCalledTimes(1);
  });

  it('a slot advance (moveToArtwork) does not clear a parked refresh (same playlist)', () => {
    service.onRefreshArtwork = null;

    canvasService.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A', 'B'].map(item)),
        index: 0,
      },
      false
    );
    expect(
      canvasService.processMessage({
        command: CastCommand.refreshArtwork,
        request: {},
      })
    ).toEqual({
      ok: false,
      error: 'No playlist handler registered yet',
      code: 'handler_pending',
    });

    // moveToArtwork only changes `index` within the same playlist — the
    // parked refresh (about the OLD artwork's failed load) must still
    // survive; AppContext's own retry loop is what re-targets it.
    canvasService.processMessage({
      command: CastCommand.moveToArtwork,
      request: { index: 1 },
    });

    const laterSpy = vi.fn(() => true);
    service.onRefreshArtwork = laterSpy;
    expect(laterSpy).toHaveBeenCalledTimes(1);
  });
});
