import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomEventName, SetupDisplayState } from '@/models/custom_event';
import SetupOverlay from './SetupOverlay';

// Separate file only to keep SetupOverlay.test.tsx under the max-lines gate.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-qr-value={value} />,
}));

describe('SetupOverlay claim_qr private-code note', () => {
  afterEach(cleanup);

  it('is not shown without a code: no QR, no line about keeping it private', async () => {
    const { container } = render(<SetupOverlay />);

    window.dispatchEvent(
      new CustomEvent(CustomEventName.SetupDisplay, {
        detail: {
          state: SetupDisplayState.ClaimQr,
          device_name: 'FF1-8EVTK3RE',
        },
      })
    );

    expect(
      await screen.findByText('Pair with the Feral File app')
    ).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByText(/Keep this code private/)).toBeNull();
  });
});
