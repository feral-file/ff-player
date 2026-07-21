import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import SetupOverlay from './SetupOverlay';

// Renders the QR value as a DOM attribute instead of drawing modules, so
// tests can assert on the exact WIFI: payload without decoding a QR image.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-qr-value={value} />,
}));

function displaySetup(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(CustomEventName.SetupDisplay, { detail }));
}

function qrValue(container: HTMLElement): string | null {
  return container.querySelector('svg')?.getAttribute('data-qr-value') ?? null;
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

describe('SetupOverlay softap_qr WIFI: payload encoding', () => {
  afterEach(() => {
    cleanup();
  });

  it('encodes a WPA QR payload when a password is present', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 'correct-horse',
    });

    await screen.findByText('Connect to Set Up This Device');
    expect(qrValue(container)).toBe('WIFI:T:WPA;S:FF1-Setup-ABCD;P:correct-horse;;');
  });

  it('encodes a nopass QR payload with no P: field when there is no password', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
    });

    await screen.findByText('Network: FF1-Setup-ABCD');
    expect(qrValue(container)).toBe('WIFI:T:nopass;S:FF1-Setup-ABCD;;');
  });

  it('encodes an empty-string password (falsy, not just undefined) as nopass too', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: '',
    });

    await screen.findByText('Network: FF1-Setup-ABCD');
    expect(qrValue(container)).toBe('WIFI:T:nopass;S:FF1-Setup-ABCD;;');
  });

  it('backslash-escapes WIFI: special characters in the SSID and password', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1;Setup:ABCD',
      password: 'pa,ss"w\\ord;1',
    });

    await screen.findByText('Connect to Set Up This Device');
    expect(qrValue(container)).toBe(
      'WIFI:T:WPA;S:FF1\\;Setup\\:ABCD;P:pa\\,ss\\"w\\\\ord\\;1;;'
    );
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

  it.each([NaN, Infinity, -Infinity])(
    'renders no percentage line for non-finite progress (%s)',
    async (progress) => {
      render(<SetupOverlay />);

      displaySetup({ state: SetupDisplayState.Updating, progress });

      expect(await screen.findByText('Updating Device Software…')).toBeTruthy();
      expect(screen.queryByText(/%$/)).toBeNull();
    }
  );

  it.each([
    [150, '100%'],
    [-10, '0%'],
  ])(
    'clamps out-of-range progress %s to %s',
    async (progress, expected) => {
      render(<SetupOverlay />);

      displaySetup({ state: SetupDisplayState.Updating, progress });

      expect(await screen.findByText('Updating Device Software…')).toBeTruthy();
      expect(screen.getByText(expected)).toBeTruthy();
    }
  );

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
