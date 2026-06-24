import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CustomEventName,
  MintPairingDisplayState,
} from '@/models/custom_event';
import MintPairingOverlay from './MintPairingOverlay';

function displayMintPairing(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent(CustomEventName.MintPairingDisplay, { detail })
  );
}

describe('MintPairingOverlay', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders code-only external device pairing instructions', async () => {
    const { container } = render(<MintPairingOverlay />);

    displayMintPairing({
      state: MintPairingDisplayState.PairingCode,
      pairingCode: 'PAIR-123',
    });

    expect(await screen.findByText('External Device Pairing Mode')).toBeTruthy();
    expect(await screen.findByText('PAIR-123')).toBeTruthy();
    expect(
      screen.getByText(
        'Input the code on the website that is asking for a session.'
      )
    ).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
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
      screen.getByText(/go to Settings > Art Computer, and approve the session/)
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
