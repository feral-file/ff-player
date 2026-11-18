import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import SetupOverlay from './SetupOverlay';

// Split from SetupOverlay.test.tsx to stay inside the max-lines budget.
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

describe('SetupOverlay softap_qr with a phone attached', () => {
  afterEach(cleanup);

  it('keeps the ordinary join-code panel and its fallback lines', async () => {
    const { container } = render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      password: 'correct-horse',
      portal_url: 'http://10.42.0.1',
      client_attached: true,
    });

    expect(
      await screen.findByText(
        "Scan the QR code, then follow your phone's prompt to connect"
      )
    ).toBeTruthy();
    expect(screen.queryByText('Finish setup on your phone')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(qrValue(container)).toBe(
      'WIFI:T:WPA;S:FF1-Setup-ABCD;P:correct-horse;;'
    );
    // The fallback lines carry a phone that got no prompt to the setup page.
    expect(screen.getByText(/Nothing opened\? Wi-Fi Settings/)).toBeTruthy();
    expect(screen.getByText('http://10.42.0.1')).toBeTruthy();
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
