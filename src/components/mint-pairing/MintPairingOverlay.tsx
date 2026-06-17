'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CustomEventName,
  MintPairingDisplayDetail,
  MintPairingDisplayState,
} from '@/models/custom_event';
import styles from './MintPairingOverlay.module.scss';

const hiddenDisplay: MintPairingDisplayDetail = {
  state: MintPairingDisplayState.Hidden,
};

function browserLabel(browserName: string | undefined): string {
  const trimmed = browserName?.trim();
  if (trimmed) {
    return trimmed;
  }
  return 'the browser';
}

/**
 * MintPairingOverlay renders above playback without changing the active route
 * or unmounting artwork media. `feral-controld` owns lifecycle state and drives
 * this display through the `mintPairingDisplay` CDP command.
 */
export default function MintPairingOverlay() {
  const [display, setDisplay] =
    useState<MintPairingDisplayDetail>(hiddenDisplay);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const handleDisplay = (event: Event) => {
      setDisplay((event as CustomEvent<MintPairingDisplayDetail>).detail);
    };

    window.addEventListener(CustomEventName.MintPairingDisplay, handleDisplay);
    return () => {
      window.removeEventListener(
        CustomEventName.MintPairingDisplay,
        handleDisplay
      );
    };
  }, []);

  useEffect(() => {
    if (
      display.state !== MintPairingDisplayState.PairingCode ||
      !display.pairingCode ||
      !canvasRef.current
    ) {
      return;
    }

    QRCode.toCanvas(canvasRef.current, display.pairingCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 10,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    }).catch((error: unknown) => {
      console.error('[MintPairingOverlay] Failed to render QR code:', error);
    });
  }, [display.pairingCode, display.state]);

  if (display.state === MintPairingDisplayState.Hidden) {
    return null;
  }

  if (display.state === MintPairingDisplayState.PairingCode) {
    return (
      <section className={styles.overlay} aria-live="polite">
        <div className={styles.qrPanel}>
          <canvas
            ref={canvasRef}
            className={styles.qrCanvas}
            aria-label="Mint pairing QR code"
          />
          <p className={styles.code}>{display.pairingCode}</p>
        </div>
      </section>
    );
  }

  if (display.state === MintPairingDisplayState.CreatingToken) {
    return (
      <section className={styles.overlay} aria-live="polite">
        <div className={styles.messagePanel}>
          <p className={styles.title}>
            Creating a new token and sending it to{' '}
            {browserLabel(display.browserName)}.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.messagePanel}>
        <p className={styles.title}>
          Received a minting request from {browserLabel(display.browserName)}.
        </p>
        <p className={styles.subtitle}>
          Open the Feral File mobile app to Approve or Reject the request.
        </p>
      </div>
    </section>
  );
}
