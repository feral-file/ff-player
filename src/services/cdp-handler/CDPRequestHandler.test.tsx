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

    const response = (window as unknown as CDPTestWindow).handleCDPRequest({
      command: 'mintPairingDisplay',
      request: {
        state: MintPairingDisplayState.PairingCode,
        pairingCode: 'PAIR-123',
      },
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
    const response = (window as unknown as CDPTestWindow).handleCDPRequest({
      command: 'mintPairingDisplay',
      request: { state: 'pairing_code' },
    });

    expect(JSON.parse(response)).toEqual({
      message: {
        ok: false,
        error: 'Invalid mint pairing display request',
      },
    });
  });

  it.each([
    MintPairingDisplayState.RequestReceived,
    MintPairingDisplayState.CreatingToken,
  ])('rejects %s requests with a non-string browser name', (state) => {
    const listener = vi.fn();
    window.addEventListener(CustomEventName.MintPairingDisplay, listener);

    const response = (window as unknown as CDPTestWindow).handleCDPRequest({
      command: 'mintPairingDisplay',
      request: { state, browserName: 123 },
    });

    expect(JSON.parse(response)).toEqual({
      message: {
        ok: false,
        error: 'Invalid mint pairing display request',
      },
    });
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(CustomEventName.MintPairingDisplay, listener);
  });
});
