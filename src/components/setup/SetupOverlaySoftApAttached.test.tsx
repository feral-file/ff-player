import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import SetupOverlay from './SetupOverlay';

// Split from SetupOverlay.test.tsx to stay inside the max-lines budget, the
// same way the narration states live in SetupOverlayNarration.test.tsx.
// Same QR mock as there: the value lands in a DOM attribute so the payload
// can be asserted without decoding an image.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-qr-value={value} />,
}));

function displaySetup(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent(CustomEventName.SetupDisplay, { detail })
  );
}

function qrValue(container: HTMLElement): string | null {
  return container.querySelector('svg')?.getAttribute('data-qr-value') ?? null;
}

describe('SetupOverlay softap_qr attached phase', () => {
  afterEach(cleanup);

  it('swaps the join QR for the portal-address QR once a phone is attached', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 'correct-horse',
      portal_url: 'http://10.42.0.1',
      client_attached: true,
    });

    expect(await screen.findByText('Finish setup on your phone')).toBeTruthy();
    // The camera is still aimed at the screen: the ONE code on it is now a
    // browser link, not the Wi-Fi join payload (feral-file#3515).
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(qrValue(container)).toBe('http://10.42.0.1');
    // The typed-address path and the hotspot credentials stay as text for a
    // phone whose camera moved on, or a second device.
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            'Nothing opened? Scan the code, or mobile data/VPN off → http://10.42.0.1 Wi-Fi FF1-Setup-ABCD · Password correct-horse · Keep connected'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/follow your phone/)).toBeNull();
  });

  it('keeps the join QR when client_attached arrives without a portal_url', async () => {
    // Nothing to encode: an address-less repaint (NM never published the
    // hotspot address) must not blank the code or paint an empty QR.
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      client_attached: true,
    });

    expect(
      await screen.findByText(
        "Scan the QR code, then follow your phone's prompt to connect"
      )
    ).toBeTruthy();
    expect(qrValue(container)).toBe('WIFI:T:nopass;S:FF1-Setup-ABCD;;');
  });

  it('returns to the join QR when the next raise repaints without the flag', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      portal_url: 'http://10.42.0.1',
      client_attached: true,
    });
    expect(await screen.findByText('Finish setup on your phone')).toBeTruthy();

    // A failed join re-raises the AP; the phone has to re-associate, so the
    // controller's fresh announcement (no flag) must paint the join code.
    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      portal_url: 'http://10.42.0.1',
    });
    expect(await screen.findByText(/follow your phone/)).toBeTruthy();
    expect(qrValue(container)).toBe('WIFI:T:nopass;S:FF1-Setup-ABCD;;');
  });
});

describe('SetupOverlay softap_qr attached phase: unusable portal_url', () => {
  afterEach(cleanup);

  it.each([
    'http://?',
    'http:///',
    'https://#missing-host',
    'http://:80',
    'http://10.42.0.1:99999',
  ])(
    'keeps the join QR for the HTTP-shaped but unparseable portal_url %s',
    async portalUrl => {
      const { container } = render(<SetupOverlay />);
      displaySetup({
        state: SetupDisplayState.SoftApQr,
        ssid: 'FF1-Setup-ABCD',
        portal_url: portalUrl,
        client_attached: true,
      });
      expect(await screen.findByText(/follow your phone/)).toBeTruthy();
      expect(qrValue(container)).toBe('WIFI:T:nopass;S:FF1-Setup-ABCD;;');
    }
  );

  it('keeps the join QR when the portal_url is not an http(s) link', async () => {
    // A bare address would render as an inert plain-text code with no join
    // code left on screen; the swap is gated on a scannable link.
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      portal_url: '10.42.0.1',
      client_attached: true,
    });

    expect(await screen.findByText(/follow your phone/)).toBeTruthy();
    expect(qrValue(container)).toBe('WIFI:T:nopass;S:FF1-Setup-ABCD;;');
  });
});

describe('SetupOverlay softap_qr after a failed join', () => {
  afterEach(cleanup);

  it('shows the failure reason under the join title', async () => {
    const { container } = render(<SetupOverlay />);
    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 'correct-horse',
      portal_url: 'http://10.42.0.1',
      reason: 'Wrong Wi-Fi password. Please check it and try again.',
    });
    expect(
      await screen.findByText(
        "Scan the QR code, then follow your phone's prompt to connect"
      )
    ).toBeTruthy();
    expect(
      screen.getByText('Wrong Wi-Fi password. Please check it and try again.')
    ).toBeTruthy();
    expect(qrValue(container)).toBe(
      'WIFI:T:WPA;S:FF1-Setup-ABCD;P:correct-horse;;'
    );
  });

  it('renders no failure line for a blank reason', async () => {
    render(<SetupOverlay />);
    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      reason: '   ',
    });
    expect(await screen.findByText(/follow your phone/)).toBeTruthy();
    expect(screen.queryByText(/password\. Please/)).toBeNull();
  });
});
