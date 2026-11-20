import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import SetupOverlay from './SetupOverlay';

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-qr-value={value} />,
}));

function displaySetup(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent(CustomEventName.SetupDisplay, { detail })
  );
}

describe('SetupOverlay version label', () => {
  afterEach(cleanup);

  it('shows the installed version beside a visible panel', async () => {
    render(<SetupOverlay />);

    displaySetup({
      state: SetupDisplayState.SoftApQr,
      ssid: 'FF1-Setup-ABCD',
      version: '3.0.1',
    });

    expect(await screen.findByText('v3.0.1')).toBeTruthy();
  });

  it('does not double the v prefix', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Joining, version: 'v3.0.1' });

    expect(await screen.findByText('v3.0.1')).toBeTruthy();
  });

  it('draws no label without a version, or with a non-string one', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Joining });
    expect(await screen.findByText('Connecting to Wi-Fi')).toBeTruthy();
    expect(screen.queryByText(/^v\d/)).toBeNull();

    displaySetup({ state: SetupDisplayState.Joining, version: 301 });
    expect(await screen.findByText('Connecting to Wi-Fi')).toBeTruthy();
    expect(screen.queryByText(/^v\d/)).toBeNull();
  });

  it('draws no label once the overlay hides', async () => {
    render(<SetupOverlay />);

    displaySetup({ state: SetupDisplayState.Joining, version: '3.0.1' });
    expect(await screen.findByText('v3.0.1')).toBeTruthy();

    displaySetup({ state: SetupDisplayState.Hidden, version: '3.0.1' });
    await waitFor(() => {
      expect(screen.queryByText('v3.0.1')).toBeNull();
    });
  });
});
