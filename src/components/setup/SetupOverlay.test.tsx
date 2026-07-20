import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import SetupOverlay from './SetupOverlay';

function displaySetup(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(CustomEventName.SetupDisplay, { detail }));
}

describe('SetupOverlay known states (connectivity)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing before any setupDisplay event has fired', () => {
    const { container } = render(<SetupOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the softap_qr state with a QR code and manual join details', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 'correct-horse',
    });

    expect(await screen.findByText('Connect to Set Up This Device')).toBeTruthy();
    expect(screen.getByText('Network: FF1-Setup-ABCD')).toBeTruthy();
    expect(screen.getByText('Password: correct-horse')).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('omits the password line when softap_qr has no password', async () => {
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
    });

    expect(await screen.findByText('Network: FF1-Setup-ABCD')).toBeTruthy();
    expect(screen.queryByText(/^Password:/)).toBeNull();
  });

  it('renders the joining state', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Joining });

    expect(await screen.findByText('Connecting to Wi-Fi…')).toBeTruthy();
  });

  it('renders join_failed with the provided reason', async () => {
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.JoinFailed,
      reason: 'Incorrect password.',
    });

    expect(await screen.findByText("Couldn't Connect to Wi-Fi")).toBeTruthy();
    expect(screen.getByText('Incorrect password.')).toBeTruthy();
    expect(
      screen.getByText("Reconnect to the device's setup hotspot and try again.")
    ).toBeTruthy();
  });

  it('renders join_failed without a reason line when none is provided', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.JoinFailed });

    expect(await screen.findByText("Couldn't Connect to Wi-Fi")).toBeTruthy();
  });
});

describe('SetupOverlay known states (update, claim, reset)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the updating state with rounded progress', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Updating, progress: 42.6 });

    expect(await screen.findByText('Updating Device Software…')).toBeTruthy();
    expect(screen.getByText('43%')).toBeTruthy();
  });

  it('renders the updating state without a percentage when progress is absent', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Updating });

    expect(await screen.findByText('Updating Device Software…')).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it('renders claim_qr with a QR code for the provided url', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.ClaimQr,
      url: 'https://feralfile.com/device_connect?token=abc',
    });

    expect(await screen.findByText('Scan to Finish Setup')).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the factory_reset state with a do-not-power-off warning', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.FactoryReset });

    expect(
      await screen.findByText('Resetting to Factory Settings…')
    ).toBeTruthy();
    expect(screen.getByText('Do not power off this device.')).toBeTruthy();
  });
});

describe('SetupOverlay hide and unknown-state behavior', () => {
  afterEach(() => {
    cleanup();
  });

  it('hides on ready and hidden states', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Joining });
    expect(await screen.findByText('Connecting to Wi-Fi…')).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Ready });
    await waitFor(() => {
      expect(screen.queryByText('Connecting to Wi-Fi…')).toBeNull();
    });

    displaySetup({ state: SetupDisplayState.Joining });
    expect(await screen.findByText('Connecting to Wi-Fi…')).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Hidden });
    await waitFor(() => {
      expect(screen.queryByText('Connecting to Wi-Fi…')).toBeNull();
    });
  });

  it('still hides on ready and hidden states after a factory_reset panel', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.FactoryReset });
    expect(
      await screen.findByText('Resetting to Factory Settings…')
    ).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Ready });
    await waitFor(() => {
      expect(
        screen.queryByText('Resetting to Factory Settings…')
      ).toBeNull();
    });

    displaySetup({ state: SetupDisplayState.FactoryReset });
    expect(
      await screen.findByText('Resetting to Factory Settings…')
    ).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Hidden });
    await waitFor(() => {
      expect(
        screen.queryByText('Resetting to Factory Settings…')
      ).toBeNull();
    });
  });

  it('renders nothing for an unrecognized future state instead of erroring', async () => {
    // Extensibility invariant: a state this build doesn't know about (e.g. a
    // future LAN pairing-approval overlay) must no-op, not throw or fall back
    // to some generic UI, so older players stay usable against newer
    // contract versions.
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.Joining,
    });
    expect(await screen.findByText('Connecting to Wi-Fi…')).toBeTruthy();

    displaySetup({
      state: 'lan_pairing_approval',
      requesterName: 'Living Room TV',
    });

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
