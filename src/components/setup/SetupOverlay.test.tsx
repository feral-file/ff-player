import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import { AppContext } from '@/context/AppContext';
import { CastCommand, CastInfo } from '@/models';
import SetupOverlay from './SetupOverlay';
import { FADE_OUT_MS } from './SetupArtworkBackground';

// Renders the QR value as a DOM attribute instead of drawing modules, so
// tests can assert on the exact WIFI: payload without decoding a QR image.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-qr-value={value} />,
}));

function displaySetup(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(CustomEventName.SetupDisplay, { detail }));
}

// softap_qr renders two codes in a fixed DOM order (join QR first, portal QR
// second — see SoftApQrPanel); qrValue reads the first, qrValues reads all.
function qrValue(container: HTMLElement): string | null {
  return container.querySelector('svg')?.getAttribute('data-qr-value') ?? null;
}

function qrValues(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('svg')).map((svg) =>
    svg.getAttribute('data-qr-value')
  );
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
    expect(screen.getByText('1. Scan to join the setup network')).toBeTruthy();
    expect(screen.getByText('2. Scan to open the setup page')).toBeTruthy();
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('renders the portal-URL QR as the second softap_qr code', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 'correct-horse',
    });

    await screen.findByText('Connect to Set Up This Device');
    // The URL must match the DNS/NAT captive design (192.0.2.1) — a change
    // here has to move in lockstep with the ffos image config.
    expect(qrValues(container)[1]).toBe('http://192.0.2.1/');
    expect(screen.getByText('http://192.0.2.1/')).toBeTruthy();
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

describe('SetupOverlay known states (updating progress)', () => {
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

});

// Split from the updating-progress describe above only to satisfy the
// max-lines-per-function lint gate; the grouping carries no behavioral
// meaning.
describe('SetupOverlay known states (claim, scanning, reset)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders claim_qr with app-discovery as primary and the QR as backup', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.ClaimQr,
      url: 'https://feralfile.com/device_connect?token=abc',
      device_name: 'FF1-8EVTK3RE',
    });

    expect(await screen.findByText('One Last Step')).toBeTruthy();
    // Primary path: open the app on the same Wi-Fi; it discovers by name.
    expect(screen.getByText('FF1-8EVTK3RE')).toBeTruthy();
    expect(
      screen.getByText(/same Wi-Fi\s+network — it will find/)
    ).toBeTruthy();
    // Backup path: the QR, explicitly framed as the fallback.
    expect(
      screen.getByText(/Frame not showing up in the app\? Scan this code/)
    ).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders claim_qr generically when no device name is provided', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.ClaimQr,
      url: 'https://feralfile.com/device_connect?token=abc',
    });

    expect(await screen.findByText('One Last Step')).toBeTruthy();
    expect(screen.getByText(/it will find\s+this frame\s+automatically/)).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the scanning state while the pre-hotspot Wi-Fi scan runs', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Scanning });

    expect(await screen.findByText('Looking for Wi-Fi Networks…')).toBeTruthy();
    expect(
      screen.getByText('The setup screen will appear here in a moment.')
    ).toBeTruthy();
  });

  it('renders the finalizing state between join success and the claim step', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Finalizing });

    expect(await screen.findByText('Wi-Fi Connected')).toBeTruthy();
    expect(
      screen.getByText(/Getting this frame ready… This can take a minute\./)
    ).toBeTruthy();
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

    // No panel for the unknown state; the panel drops immediately and the
    // background follows once its exit fade completes.
    await waitFor(() => {
      expect(container.querySelector('section')).toBeNull();
    });
    expect(screen.queryByText('Connecting to Wi-Fi…')).toBeNull();
    await waitFor(
      () => {
        expect(container.firstChild).toBeNull();
      },
      { timeout: FADE_OUT_MS * 3 }
    );
  });
});

// The bundled-artwork background must render under every visible panel while
// nothing is cast, and must never cover a live cast (e.g. an OTA `updating`
// overlay raised over the user's playing artwork) — see
// SetupArtworkBackground for the design rationale.
function overlayWithCastInfo(castInfo: CastInfo | null) {
  return (
    <AppContext.Provider
      value={{
        context: {
          isInitialized: true,
          isOnline: false,
          appRemoteConfig: { defaultPlaylistURL: '' },
          castInfo,
          displaySettings: null,
          cursorPositions: null,
        },
      }}>
      <SetupOverlay />
    </AppContext.Provider>
  );
}

describe('SetupOverlay bundled artwork background', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the same-origin bundled artwork beneath a visible panel', async () => {
    const { container } = render(overlayWithCastInfo(null));

    displaySetup({ state: SetupDisplayState.Scanning });
    await screen.findByText('Looking for Wi-Fi Networks…');

    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('/setup-artwork/index.html');
    expect(iframe?.getAttribute('sandbox')).toBe(
      'allow-same-origin allow-scripts'
    );
  });

  it('does not render the background while a cast is active', async () => {
    const { container } = render(
      overlayWithCastInfo({
        castCommand: CastCommand.displayPlaylist,
      } as CastInfo)
    );

    displaySetup({ state: SetupDisplayState.Updating, progress: 10 });
    await screen.findByText('Updating Device Software…');

    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders the background when mounted without an AppProvider', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.FactoryReset });
    await screen.findByText('Resetting to Factory Settings…');

    expect(container.querySelector('iframe')).not.toBeNull();
  });
});

// Lifecycle invariants: the artwork must keep running uninterrupted across
// setup state transitions (same DOM node — a remount would restart the
// generative piece), and every exit — overlay hiding or a cast starting
// mid-setup — plays the standard fade instead of a hard cut.
describe('SetupOverlay bundled artwork background lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('fades the background artwork out on hidden instead of hard-cutting', () => {
    vi.useFakeTimers();
    const { container } = render(<SetupOverlay />);

    act(() => {
      displaySetup({ state: SetupDisplayState.Joining });
    });
    expect(screen.getByText('Connecting to Wi-Fi…')).toBeTruthy();
    expect(container.querySelector('iframe')).not.toBeNull();

    act(() => {
      displaySetup({ state: SetupDisplayState.Hidden });
    });
    // The panel is gone immediately, but the artwork stays mounted for its
    // exit fade (the player's standard cast-fade duration)...
    expect(screen.queryByText('Connecting to Wi-Fi…')).toBeNull();
    expect(container.querySelector('iframe')).not.toBeNull();

    // ...and unmounts once the fade has played.
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS + 50);
    });
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('keeps the same iframe node across panel state transitions', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Scanning });
    await screen.findByText('Looking for Wi-Fi Networks…');
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();

    displaySetup({ state: SetupDisplayState.Joining });
    await screen.findByText('Connecting to Wi-Fi…');

    expect(container.querySelector('iframe')).toBe(iframe);
  });

  it('fades the background out when a cast starts mid-setup', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(overlayWithCastInfo(null));

    act(() => {
      displaySetup({ state: SetupDisplayState.Finalizing });
    });
    expect(screen.getByText('Wi-Fi Connected')).toBeTruthy();
    expect(container.querySelector('iframe')).not.toBeNull();

    rerender(
      overlayWithCastInfo({
        castCommand: CastCommand.displayPlaylist,
      } as CastInfo)
    );

    // Still mounted while its exit fade plays, gone after.
    expect(container.querySelector('iframe')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS + 50);
    });
    expect(container.querySelector('iframe')).toBeNull();
    // The panel itself must survive the handoff — only the background yields.
    expect(screen.getByText('Wi-Fi Connected')).toBeTruthy();
  });

  it('cancels a pending fade-out when a panel re-shows, keeping the same node', () => {
    vi.useFakeTimers();
    const { container } = render(<SetupOverlay />);

    act(() => {
      displaySetup({ state: SetupDisplayState.Joining });
    });
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();

    // Hide, then re-show mid-fade (e.g. join_failed after a hidden blip): the
    // pending unmount must be cancelled and the SAME iframe restored to full
    // opacity — a remount would restart the generative piece.
    act(() => {
      displaySetup({ state: SetupDisplayState.Hidden });
    });
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS / 2);
    });
    act(() => {
      displaySetup({ state: SetupDisplayState.JoinFailed });
    });
    act(() => {
      vi.advanceTimersByTime(FADE_OUT_MS * 2);
    });
    expect(container.querySelector('iframe')).toBe(iframe);
  });
});
