'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CustomEventName,
  SetupDisplayDetail,
  SetupDisplayState,
} from '@/models/custom_event';
import styles from './SetupOverlay.module.scss';

const hiddenDisplay: SetupDisplayDetail = { state: SetupDisplayState.Hidden };

const qrSize = 320;

/**
 * Builds a `WIFI:` QR payload for the setup hotspot. Escaping is intentionally
 * skipped: `feral-controld` generates the SSID/password for this hotspot and
 * controls their character set, so this stays a straight template.
 */
function softApQrValue(ssid: string, password: string | undefined): string {
  return `WIFI:T:WPA;S:${ssid};P:${password ?? ''};;`;
}

function SoftApQrPanel({ display }: { display: SetupDisplayDetail }) {
  const ssid = display.ssid ?? '';
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Connect to Set Up This Device</p>
        <div className={styles.qrFrame}>
          <QRCodeSVG
            value={softApQrValue(ssid, display.password)}
            size={qrSize}
            marginSize={2}
          />
        </div>
        <p className={styles.credential}>Network: {ssid}</p>
        {display.password ? (
          <p className={styles.credential}>Password: {display.password}</p>
        ) : null}
        <p className={styles.subtitle}>
          Scan the code, or join the network manually using the details
          above, then follow the prompts on your phone.
        </p>
      </div>
    </section>
  );
}

function JoiningPanel() {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Connecting to Wi-Fi&hellip;</p>
      </div>
    </section>
  );
}

function JoinFailedPanel({ display }: { display: SetupDisplayDetail }) {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Couldn&apos;t Connect to Wi-Fi</p>
        {display.reason ? (
          <p className={styles.subtitle}>{display.reason}</p>
        ) : null}
        <p className={styles.subtitle}>
          Reconnect to the device&apos;s setup hotspot and try again.
        </p>
      </div>
    </section>
  );
}

function UpdatingPanel({ display }: { display: SetupDisplayDetail }) {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Updating Device Software&hellip;</p>
        {typeof display.progress === 'number' ? (
          <p className={styles.subtitle}>{Math.round(display.progress)}%</p>
        ) : null}
      </div>
    </section>
  );
}

function FactoryResetPanel() {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Resetting to Factory Settings&hellip;</p>
        <p className={styles.subtitle}>Do not power off this device.</p>
      </div>
    </section>
  );
}

function ClaimQrPanel({ display }: { display: SetupDisplayDetail }) {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Scan to Finish Setup</p>
        {display.url ? (
          <div className={styles.qrFrame}>
            <QRCodeSVG value={display.url} size={qrSize} marginSize={2} />
          </div>
        ) : null}
        <p className={styles.subtitle}>
          Scan the code with the Feral File app to link this device.
        </p>
      </div>
    </section>
  );
}

/**
 * SetupOverlay renders the device's out-of-box and recovery setup flow
 * (Wi-Fi hotspot join, firmware update, claim pairing) above whatever else
 * is mounted. `feral-controld` owns lifecycle state and drives this display
 * through the `setupDisplay` CDP command; it is the launcher-ui replacement
 * for those screens now that setup lives inside ff-player.
 */
export default function SetupOverlay() {
  const [display, setDisplay] =
    useState<SetupDisplayDetail>(hiddenDisplay);

  useEffect(() => {
    const handleDisplay = (event: Event) => {
      setDisplay((event as CustomEvent<SetupDisplayDetail>).detail);
    };

    window.addEventListener(CustomEventName.SetupDisplay, handleDisplay);
    return () => {
      window.removeEventListener(CustomEventName.SetupDisplay, handleDisplay);
    };
  }, []);

  // `display.state` is `string` (see SetupDisplayState doc comment), so cast
  // it for the switch: known branches stay type-checked against the enum,
  // while `default` still safely no-ops for any other runtime string,
  // including future contract states this build doesn't recognize yet.
  switch (display.state as SetupDisplayState) {
    case SetupDisplayState.SoftApQr: {
      return <SoftApQrPanel display={display} />;
    }

    case SetupDisplayState.Joining: {
      return <JoiningPanel />;
    }

    case SetupDisplayState.JoinFailed: {
      return <JoinFailedPanel display={display} />;
    }

    case SetupDisplayState.Updating: {
      return <UpdatingPanel display={display} />;
    }

    case SetupDisplayState.ClaimQr: {
      return <ClaimQrPanel display={display} />;
    }

    case SetupDisplayState.FactoryReset: {
      return <FactoryResetPanel />;
    }

    case SetupDisplayState.Ready:
    case SetupDisplayState.Hidden: {
      return null;
    }

    default: {
      // Extensibility invariant: `feral-controld` can ship new setupDisplay
      // states (e.g. a future LAN pairing-approval overlay) ahead of a
      // player update that knows how to render them. Rendering nothing for
      // any state outside the switch above — instead of throwing or showing
      // a fallback — keeps older players functional against newer contract
      // versions rather than breaking on an unrecognized state.
      return null;
    }
  }
}
