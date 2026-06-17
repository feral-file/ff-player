// @vitest-environment jsdom

import { CDPRequestHandler } from './CDPRequestHandler';
import {
  CustomEventName,
  MintPairingDisplayDetail,
  MintPairingDisplayState,
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
