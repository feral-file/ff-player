'use client';

import { ReactElement, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CustomEventName,
  MintPairingDisplayDetail,
  MintPairingDisplayState,
  SetupDisplayDetail,
  SetupDisplayState,
} from '@/models/custom_event';
import SetupArtworkBackground from './SetupArtworkBackground';
import styles from './SetupOverlay.module.scss';

const hiddenDisplay: SetupDisplayDetail = { state: SetupDisplayState.Hidden };

const qrSize = 320;

/**
 * Canonical human-facing address of the provisioning portal. The hotspot's
 * dnsmasq answers EVERY DNS name (catch-all plus an explicit ff1.config
 * entry) with 192.0.2.1 — a public-looking TEST-NET address, because Samsung
 * One UI refuses captive-portal detection when probe hostnames resolve to
 * private IPs — and an nftables rule redirects 192.0.2.1:80 back to the
 * portal, so ff1.config is reachable only while the phone is on the setup
 * hotspot. Must stay in sync with `captive.conf` / `nftables.conf` in the
 * `ffos` repo and the captive-detection section of `ffos-user`
 * docs/api-design.md.
 */
const portalUrl = 'http://ff1.config';

/**
 * Escapes the characters the `WIFI:` URI convention treats as field
 * separators/terminators (`\`, `;`, `,`, `:`, `"`) with a backslash.
 * `feral-controld` currently generates SSIDs/passwords from a charset that
 * doesn't need this, but that's an implementation detail of the daemon, not
 * a guarantee of the wire contract — escaping here means the QR keeps
 * scanning correctly instead of silently truncating a field if that charset
 * ever changes.
 */
function escapeWifiField(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/**
 * Builds a `WIFI:` QR payload for the setup hotspot. Uses `T:nopass` with no
 * `P:` field when there's no password, since an empty `P:` after `T:WPA`
 * makes phones attempt (and fail) WPA auth with an empty key.
 */
function softApQrValue(ssid: string, password: string | undefined): string {
  const escapedSsid = escapeWifiField(ssid);
  if (!password) {
    return `WIFI:T:nopass;S:${escapedSsid};;`;
  }
  return `WIFI:T:WPA;S:${escapedSsid};P:${escapeWifiField(password)};;`;
}

/**
 * One join QR plus a spelled-out portal address, not a second "open the
 * portal" QR: the auto-opening captive sheet cannot be relied on across
 * phones (iOS joins scanned `WIFI:` codes from the Camera without ever
 * raising the captive-portal sheet, and some Android builds surface the
 * "sign in" notification silently or not at all), but a second code proved
 * confusing — phones can't scan it while the sheet is up, and two codes read
 * as two competing entry points. The deterministic fallback is therefore the
 * typed address: `portalUrl` resolves on the hotspot via the image's
 * catch-all DNS, so telling the user to type it covers every phone that
 * doesn't auto-open the sheet.
 */
function SoftApQrPanel({ display }: { display: SetupDisplayDetail }) {
  const ssid = display.ssid ?? '';
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Set up your Art Computer</p>
        <p className={styles.stepLabel}>Scan to join the setup network</p>
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
        <p className={`${styles.subtitle} ${styles.softApSubtitle}`}>
          The setup page opens once your phone connects. If it doesn&apos;t,
          open <strong>{portalUrl}</strong> in your phone&apos;s browser.
        </p>
      </div>
    </section>
  );
}

/**
 * Pre-hotspot scan: `feral-controld` completes a full Wi-Fi scan before it
 * raises the setup hotspot (the single radio cannot scan once the AP holds
 * it), so this is the first thing a factory-fresh device shows. Rendering it
 * — rather than a black screen — is what tells the user the frame is alive
 * and the QR screen is coming.
 */
function ScanningPanel() {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Looking for Wi-Fi networks</p>
        <p className={styles.subtitle}>
          The setup screen will appear in a moment.
        </p>
      </div>
    </section>
  );
}

function JoiningPanel() {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Connecting to Wi-Fi</p>
      </div>
    </section>
  );
}

/**
 * Post-join finalization: covers the relayer-topic wait plus the pre-claim
 * update check (and its retries) between a successful Wi-Fi join and the
 * claim screen. Without this state that window is a silent black screen and
 * users assume setup stalled.
 */
function FinalizingPanel() {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Wi-Fi connected</p>
        <p className={styles.subtitle}>
          Getting your Art Computer ready. This can take a minute.
        </p>
      </div>
    </section>
  );
}

function JoinFailedPanel({ display }: { display: SetupDisplayDetail }) {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Couldn&apos;t connect to Wi-Fi</p>
        {display.reason ? (
          <p className={styles.subtitle}>{display.reason}</p>
        ) : null}
        <p className={styles.subtitle}>
          Rejoin the setup network on your phone and try again.
        </p>
      </div>
    </section>
  );
}

function UpdatingPanel({ display }: { display: SetupDisplayDetail }) {
  // Defensive: the CDP validator already rejects non-finite progress, but
  // guarding here means a stray NaN/Infinity renders no percent line instead
  // of "NaN%"/"Infinity%" if that guard is ever bypassed or loosened. Clamp
  // to [0,100] so an out-of-range value controld never intends to send
  // (e.g. 150) shows "100%", not "150%".
  const { progress } = display;
  const percent =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.round(Math.min(100, Math.max(0, progress)))
      : null;
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Updating software</p>
        {percent !== null ? (
          <p className={styles.subtitle}>{percent}%</p>
        ) : null}
      </div>
    </section>
  );
}

function FactoryResetPanel() {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Resetting to factory settings</p>
        <p className={styles.subtitle}>Keep the power on.</p>
      </div>
    </section>
  );
}

/**
 * Pairing screen. Shown for the first-pair claim during setup AND whenever a
 * user later asks to pair another phone (`showPairingQRCode` from the app),
 * so the copy must read as a general "pair the app with this frame" page —
 * not as a final setup step. The PRIMARY path is app auto-discovery: the app
 * browses mDNS (`_ff1._tcp`) on the local network and finds this frame by
 * its advertised name. The app only auto-prompts to pair when the frame has
 * no pairing yet (first claim); once claimed, additional phones must add the
 * frame manually inside the app — the "If pairing doesn't start
 * automatically" line is what routes that second case without a separate
 * screen. The QR code is deliberately framed as the backup for when
 * discovery fails (cross-VLAN, multicast-filtering APs, or the phone on a
 * different network).
 */
function ClaimQrPanel({ display }: { display: SetupDisplayDetail }) {
  const frameName = display.device_name?.trim();
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Pair with the Feral File app</p>
        <p className={styles.subtitle}>
          Open the Feral File app on a phone connected to the same Wi-Fi
          network. If pairing doesn&apos;t start automatically, add{' '}
          {frameName ? (
            <strong>{frameName}</strong>
          ) : (
            'this Art Computer'
          )}{' '}
          in the app.
        </p>
        {display.url ? (
          <>
            <p className={styles.stepLabel}>
              Not seeing it in the app? Scan this code instead.
            </p>
            <div className={styles.qrFrame}>
              <QRCodeSVG value={display.url} size={qrSize} marginSize={2} />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Maps a setupDisplay state to its panel, or null for states that show
 * nothing. `display.state` is `string` (see SetupDisplayState doc comment),
 * so cast it for the switch: known branches stay type-checked against the
 * enum, while `default` still safely no-ops for any other runtime string,
 * including future contract states this build doesn't recognize yet.
 *
 * Exported for the tests that assert this mapping agrees with
 * `isRenderableSetupDisplayState` (overlay arbitration) for every known
 * state — the two must not drift.
 */
export function renderSetupPanel(
  display: SetupDisplayDetail
): ReactElement | null {
  switch (display.state as SetupDisplayState) {
    case SetupDisplayState.Scanning: {
      return <ScanningPanel />;
    }

    case SetupDisplayState.SoftApQr: {
      return <SoftApQrPanel display={display} />;
    }

    case SetupDisplayState.Joining: {
      return <JoiningPanel />;
    }

    case SetupDisplayState.Finalizing: {
      return <FinalizingPanel />;
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

/**
 * SetupOverlay renders the device's out-of-box and recovery setup flow
 * (Wi-Fi hotspot join, firmware update, claim pairing) above whatever else
 * is mounted. `feral-controld` owns lifecycle state and drives this display
 * through the `setupDisplay` CDP command; it is the launcher-ui replacement
 * for those screens now that setup lives inside ff-player.
 *
 * Any visible panel gets the bundled artwork layered beneath it (see
 * SetupArtworkBackground for why it's iframe-based and cast-gated). The
 * background is a stable, ALWAYS-rendered sibling of the panel: it stays
 * mounted — and the artwork keeps running uninterrupted — across setup state
 * transitions, and it must stay in the tree when the overlay hides so it can
 * play its exit fade (the player's standard cast fade) instead of
 * hard-cutting off screen; it unmounts itself once that fade completes.
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

  // Overlay arbitration, last command wins (mirror of the listener in
  // MintPairingOverlay): a non-hidden mintPairingDisplay command supersedes
  // whatever setup panel is showing, so the newest command always owns the
  // screen. Hiding the panel also lets SetupArtworkBackground play its exit
  // fade, exactly as if setupDisplay itself had gone hidden.
  useEffect(() => {
    const handleMintPairing = (event: Event) => {
      const detail = (event as CustomEvent<MintPairingDisplayDetail>).detail;
      if (detail.state !== MintPairingDisplayState.Hidden) {
        setDisplay(hiddenDisplay);
      }
    };

    window.addEventListener(
      CustomEventName.MintPairingDisplay,
      handleMintPairing
    );
    return () => {
      window.removeEventListener(
        CustomEventName.MintPairingDisplay,
        handleMintPairing
      );
    };
  }, []);

  const panel = renderSetupPanel(display);

  return (
    <>
      <SetupArtworkBackground panelVisible={panel !== null} />
      {panel}
    </>
  );
}
