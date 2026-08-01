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

    expect(await screen.findByText('Pairing code')).toBeTruthy();
    expect(await screen.findByText('PAIR-123')).toBeTruthy();
    expect(
      screen.getByText(
        'Enter it on the website that wants to play art on this Art Computer.'
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
      await screen.findByText('Chrome wants to play art on this Art Computer.')
    ).toBeTruthy();
    expect(
      screen.getByText(/go to Settings > Art Computer, and approve the request/)
    ).toBeTruthy();

    displayMintPairing({
      state: MintPairingDisplayState.CreatingToken,
      browserName: '  Chrome  ',
    });

    expect(
      await screen.findByText('Connecting Chrome to this Art Computer…')
    ).toBeTruthy();

    displayMintPairing({ state: MintPairingDisplayState.Hidden });

    await waitFor(() => {
      expect(
        screen.queryByText('Connecting Chrome to this Art Computer…')
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
        'The browser wants to play art on this Art Computer.'
      )
    ).toBeTruthy();

    displayMintPairing({
      state: MintPairingDisplayState.CreatingToken,
      browserName: '   ',
    });

    expect(
      await screen.findByText(
        'Connecting the browser to this Art Computer…'
      )
    ).toBeTruthy();
  });
});

describe('MintPairingOverlay arbitration with setupDisplay', () => {
  afterEach(() => {
    cleanup();
  });

  function displaySetup(detail: Record<string, unknown>) {
    window.dispatchEvent(
      new CustomEvent(CustomEventName.SetupDisplay, { detail })
    );
  }

  it('yields to a renderable setupDisplay state (last command wins)', async () => {
    render(<MintPairingOverlay />);

    displayMintPairing({
      state: MintPairingDisplayState.PairingCode,
      pairingCode: 'PAIR-123',
    });
    expect(await screen.findByText('PAIR-123')).toBeTruthy();

    // Both overlays paint full-screen at the same z-index; the newest
    // command must own the screen instead of DOM mount order.
    displaySetup({ state: 'scanning' });
    await waitFor(() => {
      expect(screen.queryByText('PAIR-123')).toBeNull();
    });
  });

  it('ignores setupDisplay states that render nothing', async () => {
    render(<MintPairingOverlay />);

    displayMintPairing({
      state: MintPairingDisplayState.PairingCode,
      pairingCode: 'PAIR-123',
    });
    expect(await screen.findByText('PAIR-123')).toBeTruthy();

    // Unknown future states and hidden/ready paint no setup panel, so the
    // pairing code must stay — blanking it for an invisible panel would
    // hide the accepted command entirely.
    displaySetup({ state: 'future_lan_approval' });
    displaySetup({ state: 'hidden' });
    displaySetup({ state: 'ready' });
    expect(await screen.findByText('PAIR-123')).toBeTruthy();
  });
});
