import { cleanup, render, screen, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CustomEventName,
  MintPairingDisplayState,
} from '@/models/custom_event';
import MintPairingOverlay from './MintPairingOverlay';

vi.mock('qrcode', () => ({
  default: {
    toCanvas: vi.fn(() => Promise.resolve()),
  },
}));

function displayMintPairing(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent(CustomEventName.MintPairingDisplay, { detail })
  );
}

describe('MintPairingOverlay', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the pairing QR code and visible pairing code', async () => {
    render(<MintPairingOverlay />);

    displayMintPairing({
      state: MintPairingDisplayState.PairingCode,
      pairingCode: 'PAIR-123',
    });

    expect(await screen.findByText('PAIR-123')).toBeTruthy();
    await waitFor(() => {
      expect(QRCode.toCanvas).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        'PAIR-123',
        expect.objectContaining({ errorCorrectionLevel: 'M' })
      );
    });
  });

  it('switches from code display to browser request status and hides', async () => {
    render(<MintPairingOverlay />);

    displayMintPairing({
      state: MintPairingDisplayState.RequestReceived,
      browserName: '  Chrome  ',
    });

    expect(
      await screen.findByText('Received a minting request from Chrome.')
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Open the Feral File mobile app to Approve or Reject the request.'
      )
    ).toBeTruthy();

    displayMintPairing({
      state: MintPairingDisplayState.CreatingToken,
      browserName: '  Chrome  ',
    });

    expect(
      await screen.findByText('Creating a new token and sending it to Chrome.')
    ).toBeTruthy();

    displayMintPairing({ state: MintPairingDisplayState.Hidden });

    await waitFor(() => {
      expect(
        screen.queryByText('Creating a new token and sending it to Chrome.')
      ).toBeNull();
    });
  });

  it('uses the generic browser label when the browser name is blank', async () => {
    render(<MintPairingOverlay />);

    displayMintPairing({
      state: MintPairingDisplayState.RequestReceived,
      browserName: '   ',
    });

    expect(
      await screen.findByText(
        'Received a minting request from the browser.'
      )
    ).toBeTruthy();

    displayMintPairing({
      state: MintPairingDisplayState.CreatingToken,
      browserName: '   ',
    });

    expect(
      await screen.findByText(
        'Creating a new token and sending it to the browser.'
      )
    ).toBeTruthy();
  });
});
