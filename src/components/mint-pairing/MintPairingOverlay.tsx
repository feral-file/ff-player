'use client';

import { useEffect, useState } from 'react';
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

  if (display.state === MintPairingDisplayState.Hidden) {
    return null;
  }

  if (display.state === MintPairingDisplayState.PairingCode) {
    return (
      <section className={styles.overlay} aria-live="polite">
        <div className={styles.codePanel}>
          <p className={styles.title}>External Device Pairing Mode</p>
          <p className={styles.code}>{display.pairingCode}</p>
          <p className={styles.subtitle}>
            Input the code on the website that is asking for a session.
          </p>
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
          Open the Feral File mobile app, go to Settings &gt; Art Computer, and
          approve the session.
        </p>
      </div>
    </section>
  );
}
