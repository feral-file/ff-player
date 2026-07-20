// @vitest-environment jsdom

import { CDPRequestHandler } from './CDPRequestHandler';
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

  it('rejects join_failed requests with a non-string reason', () => {
    expectInvalidSetupDisplayRequest({
      state: SetupDisplayState.JoinFailed,
      reason: 500,
    });
  });
});
