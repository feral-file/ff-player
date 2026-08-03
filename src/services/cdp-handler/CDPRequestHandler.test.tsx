// @vitest-environment jsdom

import { CDPRequestHandler } from './CDPRequestHandler';
import { CastCommand } from '@/models';
import type { DP1Call, DP1Item } from '@/models/dp1.model';
import {
  CustomEventName,
  MintPairingDisplayDetail,
  MintPairingDisplayState,
  SetupDisplayDetail,
  SetupDisplayState,
} from '@/models/custom_event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CDPTestWindow = Window & {
  handleCDPRequest: (payload: Record<string, unknown>) => string;
};

/**
 * Send a mint pairing CDP request through the browser-exposed bridge.
 */
function handleMintPairingDisplay(request: Record<string, unknown>) {
  return (window as unknown as CDPTestWindow).handleCDPRequest({
    command: 'mintPairingDisplay',
    request,
  });
}

/**
 * Assert malformed mint pairing payloads fail before an overlay event fires.
 */
function expectInvalidMintPairingRequest(request: Record<string, unknown>) {
  const listener = vi.fn();
  window.addEventListener(CustomEventName.MintPairingDisplay, listener);

  const response = handleMintPairingDisplay(request);

  expect(JSON.parse(response)).toEqual({
    message: {
      ok: false,
      error: 'Invalid mint pairing display request',
    },
  });
  expect(listener).not.toHaveBeenCalled();

  window.removeEventListener(CustomEventName.MintPairingDisplay, listener);
}

describe('CDPRequestHandler mint pairing display command', () => {
  beforeEach(() => {
    CDPRequestHandler.getInstance().initialize();
  });

  afterEach(() => {
    CDPRequestHandler.getInstance().cleanup();
    vi.restoreAllMocks();
  });

  it('dispatches valid mint pairing display requests', () => {
    const listener = vi.fn();
    window.addEventListener(CustomEventName.MintPairingDisplay, listener);

    const response = handleMintPairingDisplay({
      state: MintPairingDisplayState.PairingCode,
      pairingCode: 'PAIR-123',
    });

    expect(JSON.parse(response)).toEqual({ message: { ok: true } });
    expect(listener).toHaveBeenCalledTimes(1);
    const dispatchedEvent = listener.mock.calls[0]?.[0] as
      | CustomEvent<MintPairingDisplayDetail>
      | undefined;
    expect(dispatchedEvent?.detail).toEqual({
      state: MintPairingDisplayState.PairingCode,
      pairingCode: 'PAIR-123',
    });

    window.removeEventListener(CustomEventName.MintPairingDisplay, listener);
  });

  it('rejects malformed mint pairing display requests', () => {
    expectInvalidMintPairingRequest({ state: 'pairing_code' });
  });

  it.each(['', '   '])(
    'rejects pairing code requests with a blank pairing code',
    (pairingCode) => {
      expectInvalidMintPairingRequest({
        state: MintPairingDisplayState.PairingCode,
        pairingCode,
      });
    }
  );

  it('rejects optional non-string pairing codes on status requests', () => {
    expectInvalidMintPairingRequest({
      state: MintPairingDisplayState.RequestReceived,
      pairingCode: 123,
    });
  });

  it.each([
    MintPairingDisplayState.RequestReceived,
    MintPairingDisplayState.CreatingToken,
  ])('rejects %s requests with a non-string browser name', (state) => {
    expectInvalidMintPairingRequest({
      state,
      browserName: 123,
    });
  });
});

/**
 * Send a setup display CDP request through the browser-exposed bridge.
 */
function handleSetupDisplay(request: Record<string, unknown>) {
  return (window as unknown as CDPTestWindow).handleCDPRequest({
    command: 'setupDisplay',
    request,
  });
}

/**
 * Assert malformed setup display payloads fail before an overlay event fires.
 */
function expectInvalidSetupDisplayRequest(request: Record<string, unknown>) {
  const listener = vi.fn();
  window.addEventListener(CustomEventName.SetupDisplay, listener);

  const response = handleSetupDisplay(request);

  expect(JSON.parse(response)).toEqual({
    message: {
      ok: false,
      error: 'Invalid setup display request',
    },
  });
  expect(listener).not.toHaveBeenCalled();

  window.removeEventListener(CustomEventName.SetupDisplay, listener);
}

describe('CDPRequestHandler setup display command (accepted requests)', () => {
  beforeEach(() => {
    CDPRequestHandler.getInstance().initialize();
  });

  afterEach(() => {
    CDPRequestHandler.getInstance().cleanup();
    vi.restoreAllMocks();
  });

  it('dispatches a valid softap_qr request', () => {
    const listener = vi.fn();
    window.addEventListener(CustomEventName.SetupDisplay, listener);

    const response = handleSetupDisplay({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 'correct-horse',
    });

    expect(JSON.parse(response)).toEqual({ message: { ok: true } });
    expect(listener).toHaveBeenCalledTimes(1);
    const dispatchedEvent = listener.mock.calls[0]?.[0] as
      | CustomEvent<SetupDisplayDetail>
      | undefined;
    expect(dispatchedEvent?.detail).toEqual({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 'correct-horse',
    });

    window.removeEventListener(CustomEventName.SetupDisplay, listener);
  });

  it.each([
    SetupDisplayState.Joining,
    SetupDisplayState.JoinFailed,
    SetupDisplayState.Updating,
    SetupDisplayState.Ready,
    SetupDisplayState.Hidden,
  ])('dispatches a bare %s request', (state) => {
    const listener = vi.fn();
    window.addEventListener(CustomEventName.SetupDisplay, listener);

    const response = handleSetupDisplay({ state });

    expect(JSON.parse(response)).toEqual({ message: { ok: true } });
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(CustomEventName.SetupDisplay, listener);
  });

  it('dispatches a valid claim_qr request', () => {
    const listener = vi.fn();
    window.addEventListener(CustomEventName.SetupDisplay, listener);

    const response = handleSetupDisplay({
      state: SetupDisplayState.ClaimQr,
      url: 'https://feralfile.com/device_connect?token=abc',
    });

    expect(JSON.parse(response)).toEqual({ message: { ok: true } });
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(CustomEventName.SetupDisplay, listener);
  });

  it('dispatches an updating request with a numeric progress field', () => {
    const listener = vi.fn();
    window.addEventListener(CustomEventName.SetupDisplay, listener);

    const response = handleSetupDisplay({
      state: SetupDisplayState.Updating,
      progress: 42,
    });

    expect(JSON.parse(response)).toEqual({ message: { ok: true } });
    const dispatchedEvent = listener.mock.calls[0]?.[0] as
      | CustomEvent<SetupDisplayDetail>
      | undefined;
    expect(dispatchedEvent?.detail.progress).toBe(42);

    window.removeEventListener(CustomEventName.SetupDisplay, listener);
  });

  it('dispatches an unrecognized future state as long as it is a non-empty string', () => {
    // Extensibility invariant: the handler forwards states this player build
    // does not yet know about (e.g. a future LAN pairing-approval state) so
    // `feral-controld` never sees an error talking to an older player.
    const listener = vi.fn();
    window.addEventListener(CustomEventName.SetupDisplay, listener);

    const response = handleSetupDisplay({
      state: 'lan_pairing_approval',
      requesterName: 'Living Room TV',
    });

    expect(JSON.parse(response)).toEqual({ message: { ok: true } });
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(CustomEventName.SetupDisplay, listener);
  });
});

describe('CDPRequestHandler setup display command (rejected requests)', () => {
  beforeEach(() => {
    CDPRequestHandler.getInstance().initialize();
  });

  afterEach(() => {
    CDPRequestHandler.getInstance().cleanup();
    vi.restoreAllMocks();
  });

  it('rejects requests missing a state', () => {
    expectInvalidSetupDisplayRequest({ ssid: 'FF1-Setup-ABCD' });
  });

  it.each(['', '   '])('rejects requests with a blank state %j', (state) => {
    expectInvalidSetupDisplayRequest({ state });
  });

  it('rejects softap_qr requests without an ssid', () => {
    expectInvalidSetupDisplayRequest({ state: SetupDisplayState.SoftApQr });
  });

  it('rejects softap_qr requests with a non-string password', () => {
    expectInvalidSetupDisplayRequest({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 12345,
    });
  });

  it('rejects claim_qr requests without a url', () => {
    expectInvalidSetupDisplayRequest({ state: SetupDisplayState.ClaimQr });
  });

  it('rejects updating requests with a non-numeric progress', () => {
    expectInvalidSetupDisplayRequest({
      state: SetupDisplayState.Updating,
      progress: '42',
    });
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects updating requests with non-finite progress (%s)',
    (progress) => {
      expectInvalidSetupDisplayRequest({
        state: SetupDisplayState.Updating,
        progress,
      });
    }
  );

  it('rejects join_failed requests with a non-string reason', () => {
    expectInvalidSetupDisplayRequest({
      state: SetupDisplayState.JoinFailed,
      reason: 500,
    });
  });
});

const item = (id: string): DP1Item =>
  ({ id, source: `https://example.com/${id}.jpg`, license: {} }) as DP1Item;

const playlist = (id: string, items: DP1Item[]): DP1Call => ({
  dpVersion: '1',
  id,
  title: id,
  items,
});

type StatusWindow = Window & { __ffosPlayerStatus?: (() => string) | null };

/** Parses the installed __ffosPlayerStatus global's JSON payload. */
function readPlayerStatus(): Record<string, unknown> {
  const fn = (window as unknown as StatusWindow).__ffosPlayerStatus;
  if (!fn) {
    throw new Error('__ffosPlayerStatus is not installed');
  }
  return JSON.parse(fn()) as Record<string, unknown>;
}

// Fresh module registry per test: bootHydrationState()'s 'pending' value is
// only observable before completeBootCastHydration ever runs on a given
// CanvasService singleton (same one-way-gate constraint as
// CanvasService.bootHydration.test.ts), and CDPRequestHandler is itself a
// singleton. Both are re-imported together so the fresh CDPRequestHandler
// binds the SAME fresh canvasService instance the test then drives directly.
const freshHandlerAndService = async () => {
  vi.resetModules();
  const [{ CDPRequestHandler: FreshHandler }, { canvasService: freshCanvas }] =
    await Promise.all([
      import('./CDPRequestHandler'),
      import('../CanvasService'),
    ]);
  return { handler: FreshHandler.getInstance(), canvas: freshCanvas };
};

describe('CDPRequestHandler __ffosPlayerStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Note: getInstance() alone installs the global — the constructor calls
  // initialize() eagerly whenever `window` exists — so there is no
  // observable "before initialize()" window from outside; every test here
  // calls initialize() explicitly anyway to document the intended call
  // site, but it is a no-op against the constructor's own call.

  it('reports protocol 1, the current route, and pending hydration on install', async () => {
    const { handler } = await freshHandlerAndService();
    handler.initialize();

    expect(readPlayerStatus()).toEqual({
      protocol: 1,
      route: window.location.pathname,
      handlerRegistered: false,
      hasArtwork: false,
      bootHydration: 'pending',
    });

    handler.cleanup();
  });

  it('reflects a registered refresh handler and active artwork', async () => {
    const { handler, canvas } = await freshHandlerAndService();
    handler.initialize();

    canvas.onRefreshArtwork = () => true;
    canvas.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A'].map(item)),
        index: 0,
      },
      false
    );

    const status = readPlayerStatus();
    expect(status.handlerRegistered).toBe(true);
    expect(status.hasArtwork).toBe(true);

    handler.cleanup();
  });

  it('reports ok once boot hydration settles cleanly', async () => {
    const { handler, canvas } = await freshHandlerAndService();
    handler.initialize();

    canvas.completeBootCastHydration('ok');

    expect(readPlayerStatus().bootHydration).toBe('ok');

    handler.cleanup();
  });

  it('reports failed when initCastInfo\'s outcome was recorded as failed', async () => {
    const { handler, canvas } = await freshHandlerAndService();
    handler.initialize();

    canvas.completeBootCastHydration('failed');

    expect(readPlayerStatus().bootHydration).toBe('failed');

    handler.cleanup();
  });

  it('reports halted_cleared after a mid-hydration disconnect settles', async () => {
    const { handler, canvas } = await freshHandlerAndService();
    handler.initialize();

    canvas.disconnect();
    canvas.completeBootCastHydration('ok');

    expect(readPlayerStatus().bootHydration).toBe('halted_cleared');

    handler.cleanup();
  });

  it('is nulled by cleanup(), so a torn-down page reports nothing', async () => {
    const { handler } = await freshHandlerAndService();
    handler.initialize();

    handler.cleanup();

    expect((window as unknown as StatusWindow).__ffosPlayerStatus).toBeNull();
  });

  it('re-reads live state on every call rather than caching', async () => {
    const { handler, canvas } = await freshHandlerAndService();
    handler.initialize();

    expect(readPlayerStatus().hasArtwork).toBe(false);
    canvas.setCastInfo(
      {
        castCommand: CastCommand.displayPlaylist,
        playlist: playlist('active', ['A'].map(item)),
        index: 0,
      },
      false
    );
    expect(readPlayerStatus().hasArtwork).toBe(true);

    handler.cleanup();
  });
});
