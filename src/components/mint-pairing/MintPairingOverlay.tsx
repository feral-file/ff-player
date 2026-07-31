'use client';

import { useEffect, useState } from 'react';
import {
  CustomEventName,
  MintPairingDisplayDetail,
  MintPairingDisplayState,
  SetupDisplayDetail,
  isRenderableSetupDisplayState,
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

  // Overlay arbitration, last command wins (mirrored in SetupOverlay): both
  // overlays paint fixed full-screen at the same z-index, so if
  // feral-controld raises a renderable setupDisplay state while the pairing
  // panel is up, this panel yields — the newest command is what's on
  // screen, deterministically, instead of DOM mount order deciding. States
  // this build can't render are ignored: SetupOverlay shows nothing for
  // them, and blanking the pairing code for an invisible panel would hide
  // the accepted command entirely.
  useEffect(() => {
    const handleSetupDisplay = (event: Event) => {
      const detail = (event as CustomEvent<SetupDisplayDetail>).detail;
      if (isRenderableSetupDisplayState(detail.state)) {
        setDisplay(hiddenDisplay);
      }
    };

    window.addEventListener(CustomEventName.SetupDisplay, handleSetupDisplay);
    return () => {
      window.removeEventListener(
        CustomEventName.SetupDisplay,
        handleSetupDisplay
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
          <p className={styles.title}>Pairing code</p>
          <p className={styles.code}>{display.pairingCode}</p>
          <p className={styles.subtitle}>
            Enter this code on the website that requested a session.
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
          Open the Feral File app, go to Settings &gt; Art Computer, and
          approve the session.
        </p>
      </div>
    </section>
  );
}
