import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CustomEventName,
  MintPairingDisplayState,
  SetupDisplayState,
  isRenderableSetupDisplayState,
} from '@/models/custom_event';
import { AppContext } from '@/context/AppContext';
import { CastCommand, CastInfo } from '@/models';
import SetupOverlay, { renderSetupPanel } from './SetupOverlay';
import { FADE_OUT_MS } from './SetupArtworkBackground';

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
  afterEach(cleanup);

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
      portal_url: 'http://10.42.0.1',
    });

    expect(
      await screen.findByText(
        "Scan the QR code, then follow your phone's prompt to connect"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            'Nothing opened? Wi-Fi Settings → FF1-Setup-ABCD Password correct-horse · Keep connected Still stuck? Mobile data/VPN off → http://10.42.0.1'
      )
    ).toBeTruthy();
    expect(screen.getByText(/Mobile data\/VPN off/)).toBeTruthy();
    expect(screen.getByText('http://10.42.0.1')).toBeTruthy();
    // Exactly ONE code (the network join). The portal is reached via the
    // auto-opening captive sheet or by typing the direct address — a
    // second "open the portal" QR proved confusing and was removed.
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('omits the password line when softap_qr has no password', async () => {
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
    });

    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            'Nothing opened? Wi-Fi Settings → FF1-Setup-ABCD Keep connected'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Password/)).toBeNull();
    expect(screen.queryByText(/Setup page/)).toBeNull();
    expect(screen.queryByText(/Mobile data\/VPN off/)).toBeNull();
    expect(screen.queryByText(/ff1\.config/)).toBeNull();
  });
});

describe('SetupOverlay known states (connection progress)', () => {
  afterEach(cleanup);

  it('renders the joining state', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Joining });

    expect(await screen.findByText('Connecting to Wi-Fi')).toBeTruthy();
  });

  it('renders a bare join_failed with a fallback action line', async () => {
    // A reason-less join_failed is valid per the CDP validator; the panel
    // must not be a dead-end title while controld re-raises the AP.
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.JoinFailed });

    expect(await screen.findByText("Couldn't connect to Wi-Fi")).toBeTruthy();
    expect(screen.getByText('Please try again.')).toBeTruthy();
  });

  it('renders join_failed with the provided reason', async () => {
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.JoinFailed,
      reason: 'Incorrect password.',
    });

    expect(await screen.findByText("Couldn't connect to Wi-Fi")).toBeTruthy();
    expect(screen.getByText('Incorrect password.')).toBeTruthy();
    // No rejoin instruction: the AP re-raise re-renders softap_qr right
    // after, and that screen is the rejoin instruction.
    expect(screen.queryByText(/setup network/)).toBeNull();
  });

  it('renders join_failed without a reason line when none is provided', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.JoinFailed });

    expect(await screen.findByText("Couldn't connect to Wi-Fi")).toBeTruthy();
  });
});

// The connecting and setup_error prose-narration states are tested in
// SetupOverlayNarration.test.tsx (split to stay inside the max-lines budget),
// as is join_failed's blank-`reason` handling — all three panels share that
// invariant, so the cases that pin it are kept together over there.

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

    await screen.findByText(
      "Scan the QR code, then follow your phone's prompt to connect"
    );
    expect(qrValue(container)).toBe('WIFI:T:WPA;S:FF1-Setup-ABCD;P:correct-horse;;');
  });

  it('encodes a nopass QR payload with no P: field when there is no password', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
    });

    await screen.findByText(
      "Scan the QR code, then follow your phone's prompt to connect"
    );
    expect(qrValue(container)).toBe('WIFI:T:nopass;S:FF1-Setup-ABCD;;');
  });

  it('encodes an empty-string password (falsy, not just undefined) as nopass too', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: '',
    });

    await screen.findByText(
      "Scan the QR code, then follow your phone's prompt to connect"
    );
    expect(qrValue(container)).toBe('WIFI:T:nopass;S:FF1-Setup-ABCD;;');
  });

  it('backslash-escapes WIFI: special characters in the SSID and password', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1;Setup:ABCD',
      password: 'pa,ss"w\\ord;1',
    });

    await screen.findByText(
      "Scan the QR code, then follow your phone's prompt to connect"
    );
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

    expect(await screen.findByText('Updating software')).toBeTruthy();
    expect(screen.getByText('43%')).toBeTruthy();
    expect(screen.getByText("Don't unplug it.")).toBeTruthy();
  });

  it('renders the updating state without a percentage when progress is absent', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Updating });

    expect(await screen.findByText('Updating software')).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])(
    'renders no percentage line for non-finite progress (%s)',
    async (progress) => {
      render(<SetupOverlay />);

      displaySetup({ state: SetupDisplayState.Updating, progress });

      expect(await screen.findByText('Updating software')).toBeTruthy();
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

      expect(await screen.findByText('Updating software')).toBeTruthy();
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

    expect(await screen.findByText('Pair with the Feral File app')).toBeTruthy();
    // Primary path: open the app on the same Wi-Fi and look for the frame
    // by name — covers both the auto-prompt and manual-add cases.
    expect(screen.getByText('FF1-8EVTK3RE')).toBeTruthy();
    // The claim step is the ONE flow that requires a phone (the app), so
    // the copy must name it — pinned as the full sentence.
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            'Open the app on a phone on the same Wi-Fi and look for FF1-8EVTK3RE.'
      )
    ).toBeTruthy();
    // Backup path: the QR, framed as the fallback.
    expect(screen.getByText('Or scan this code.')).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders claim_qr generically when no device name is provided', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.ClaimQr,
      url: 'https://feralfile.com/device_connect?token=abc',
    });

    expect(await screen.findByText('Pair with the Feral File app')).toBeTruthy();
    expect(screen.getByText(/look for\s+this Art Computer/)).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the scanning state while the pre-hotspot Wi-Fi scan runs', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Scanning });

    expect(await screen.findByText('Looking for Wi-Fi networks')).toBeTruthy();
    expect(
      screen.getByText('The setup screen will appear in a moment.')
    ).toBeTruthy();
  });

  it('renders the finalizing state between join success and the claim step', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Finalizing });

    expect(await screen.findByText('Wi-Fi connected')).toBeTruthy();
    expect(
      screen.getByText(/Getting your Art Computer ready\. This can take a minute\./)
    ).toBeTruthy();
  });

  it('renders the factory_reset state with a do-not-power-off warning', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.FactoryReset });

    expect(
      await screen.findByText('Resetting to factory settings')
    ).toBeTruthy();
    expect(screen.getByText("Don't unplug it.")).toBeTruthy();
  });
});

describe('SetupOverlay hide and unknown-state behavior', () => {
  afterEach(() => {
    cleanup();
  });

  it('hides on ready and hidden states', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Joining });
    expect(await screen.findByText('Connecting to Wi-Fi')).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Ready });
    await waitFor(() => {
      expect(screen.queryByText('Connecting to Wi-Fi')).toBeNull();
    });

    displaySetup({ state: SetupDisplayState.Joining });
    expect(await screen.findByText('Connecting to Wi-Fi')).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Hidden });
    await waitFor(() => {
      expect(screen.queryByText('Connecting to Wi-Fi')).toBeNull();
    });
  });

  it('still hides on ready and hidden states after a factory_reset panel', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.FactoryReset });
    expect(
      await screen.findByText('Resetting to factory settings')
    ).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Ready });
    await waitFor(() => {
      expect(
        screen.queryByText('Resetting to factory settings')
      ).toBeNull();
    });

    displaySetup({ state: SetupDisplayState.FactoryReset });
    expect(
      await screen.findByText('Resetting to factory settings')
    ).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Hidden });
    await waitFor(() => {
      expect(
        screen.queryByText('Resetting to factory settings')
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
    expect(await screen.findByText('Connecting to Wi-Fi')).toBeTruthy();

    displaySetup({
      state: 'lan_pairing_approval',
      requesterName: 'Living Room TV',
    });

    // No panel for the unknown state; the panel drops immediately and the
    // background follows once its exit fade completes.
    await waitFor(() => {
      expect(container.querySelector('section')).toBeNull();
    });
    expect(screen.queryByText('Connecting to Wi-Fi')).toBeNull();
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
          // Healthy playback: these suites cover the setup-flow branch of
          // the background's show condition. The offline-degraded branch has
          // its own matrix in SetupArtworkBackground.test.tsx.
          playbackDegraded: false,
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
    await screen.findByText('Looking for Wi-Fi networks');

    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('/setup-artwork/index.html');
    // allow-scripts WITHOUT allow-same-origin: the pair together would let
    // the same-origin artwork document strip its own sandbox.
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('does not render the background while a cast is active', async () => {
    const { container } = render(
      overlayWithCastInfo({
        castCommand: CastCommand.displayPlaylist,
      } as CastInfo)
    );

    displaySetup({ state: SetupDisplayState.Updating, progress: 10 });
    await screen.findByText('Updating software');

    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders the background when mounted without an AppProvider', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.FactoryReset });
    await screen.findByText('Resetting to factory settings');

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
    expect(screen.getByText('Connecting to Wi-Fi')).toBeTruthy();
    expect(container.querySelector('iframe')).not.toBeNull();

    act(() => {
      displaySetup({ state: SetupDisplayState.Hidden });
    });
    // The panel is gone immediately, but the artwork stays mounted for its
    // exit fade (the player's standard cast-fade duration)...
    expect(screen.queryByText('Connecting to Wi-Fi')).toBeNull();
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
    await screen.findByText('Looking for Wi-Fi networks');
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();

    displaySetup({ state: SetupDisplayState.Joining });
    await screen.findByText('Connecting to Wi-Fi');

    expect(container.querySelector('iframe')).toBe(iframe);
  });

  it('fades the background out when a cast starts mid-setup', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(overlayWithCastInfo(null));

    act(() => {
      displaySetup({ state: SetupDisplayState.Finalizing });
    });
    expect(screen.getByText('Wi-Fi connected')).toBeTruthy();
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
    expect(screen.getByText('Wi-Fi connected')).toBeTruthy();
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

describe('SetupOverlay arbitration with mintPairingDisplay', () => {
  afterEach(() => {
    cleanup();
  });

  function displayMintPairing(detail: Record<string, unknown>) {
    window.dispatchEvent(
      new CustomEvent(CustomEventName.MintPairingDisplay, { detail })
    );
  }

  it('yields to a non-hidden mintPairingDisplay command (last command wins)', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Scanning });
    await screen.findByText('Looking for Wi-Fi networks');

    displayMintPairing({
      state: MintPairingDisplayState.PairingCode,
      pairingCode: 'PAIR-123',
    });
    await waitFor(() => {
      expect(screen.queryByText('Looking for Wi-Fi networks')).toBeNull();
    });
  });

  it('keeps its panel when mintPairingDisplay goes hidden', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Scanning });
    await screen.findByText('Looking for Wi-Fi networks');

    displayMintPairing({ state: MintPairingDisplayState.Hidden });
    expect(await screen.findByText('Looking for Wi-Fi networks')).toBeTruthy();
  });

  it('isRenderableSetupDisplayState agrees with renderSetupPanel for every known state', () => {
    // The arbitration predicate and the panel switch encode the same
    // "does this state paint pixels" knowledge in two places; this pins
    // them together so they cannot drift.
    for (const state of Object.values(SetupDisplayState)) {
      const rendersPanel =
        renderSetupPanel({ state, ssid: 'x', url: 'https://x', progress: 1 }) !==
        null;
      expect(
        isRenderableSetupDisplayState(state),
        `state ${state} renderable mismatch`
      ).toBe(rendersPanel);
    }

    // Extensibility invariant: unknown future states paint nothing AND are
    // not renderable, so they never blank the pairing code.
    expect(renderSetupPanel({ state: 'future_lan_approval' })).toBeNull();
    expect(isRenderableSetupDisplayState('future_lan_approval')).toBe(false);
  });
});
