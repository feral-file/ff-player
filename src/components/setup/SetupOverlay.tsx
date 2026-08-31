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
 * controld's `reason` prose, or `undefined` when there is nothing worth
 * rendering. The CDP validator only checks that `reason` is a string, so an
 * empty or whitespace-only value is a valid command and reaches these panels
 * — most plausibly from a daemon-side template whose substitution came back
 * empty. Collapsing that to absent is what makes every panel below take its
 * no-reason branch (fallback line, or no subtitle element at all) instead of
 * rendering a blank subtitle under the title.
 */
function proseReason(display: SetupDisplayDetail): string | undefined {
  // Explicit `=== ''` rather than a truthiness fold: `??` cannot express this
  // (an empty string is not nullish) and `||` on a nullable left operand trips
  // prefer-nullish-coalescing, so the emptiness test has to be spelled out.
  const trimmed = display.reason?.trim();
  return trimmed === '' ? undefined : trimmed;
}

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
 * One join QR plus a direct on-link portal address, not a second "open the
 * portal" QR: the auto-opening captive sheet cannot be relied on across
 * phones, but a second code reads as a competing entry point. controld gets
 * the address NetworkManager actually assigned to the active hotspot and
 * sends it as portal_url. Once the user accepts the no-internet setup Wi-Fi,
 * a literal on-link IP bypasses Private DNS and cellular DNS entirely.
 * Older controllers omit the optional field, and this player then omits the
 * manual-address instruction rather than presenting an unreliable DNS name.
 */
/*
 * Scanning a WIFI: code only proposes the hotspot; the phone owns the prompt
 * that accepts it. Those labels vary (Join, Connect, Sign in, or no prompt),
 * so the display names the required follow-up instead of an OS-specific
 * button. The manual path still works from a laptop because it is phrased in
 * terms of Wi-Fi settings, not a camera-only action.
 */
function SoftApQrPanel({ display }: { display: SetupDisplayDetail }) {
  const ssid = display.ssid ?? '';
  const portalUrl = display.portal_url?.trim();
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>
          Scan the QR code, then follow your phone&apos;s prompt to connect
        </p>
        <div className={styles.qrFrame}>
          <QRCodeSVG
            value={softApQrValue(ssid, display.password)}
            size={qrSize}
            marginSize={2}
          />
        </div>
        <p className={`${styles.subtitle} ${styles.softApSubtitle}`}>
          Nothing opened? Wi-Fi Settings → <strong>{ssid}</strong>
          <br />{' '}
          {display.password ? (
            <>
              Password <strong>{display.password}</strong> ·{' '}
            </>
          ) : null}
          Keep connected
          {portalUrl ? (
            <>
              <br /> Still stuck? Mobile data/VPN off →{' '}
              <strong>{portalUrl}</strong>
            </>
          ) : null}
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

/*
 * Provisioned-device connectivity narration (controld's boot/offline hedge,
 * M-0/M-1): the device has saved Wi-Fi but its link or internet access is
 * not confirmed yet. The title is deliberately neutral — on a NORMAL reboot
 * controld paints this state in the ~1s window between CDP connect and the
 * first online confirmation, so an asserting title (join_failed's
 * "Couldn't connect") would flash a false failure on every boot. The reason
 * line carries controld's evidence-scoped prose ("Checking the network
 * connection…", "…no internet access. Retrying…"); a bare request — reason
 * absent or blank — renders the title alone.
 */
function ConnectingPanel({ display }: { display: SetupDisplayDetail }) {
  const reason = proseReason(display);
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Connecting to the network</p>
        {reason ? <p className={styles.subtitle}>{reason}</p> : null}
      </div>
    </section>
  );
}

/*
 * Persistent provisioning failure (controld's escalation latches: the setup
 * hotspot repeatedly failing to start or to release the radio). The reason
 * line carries controld's full prose — what happened, that retries continue
 * automatically underneath, and the power-cycle fallback — so this panel
 * adds only a title. The title must not assert a failed Wi-Fi join
 * (join_failed's does): these errors fire while no join is in progress at
 * all, and on old players the send-time downgrade already shows this prose
 * under the wrong "Couldn't connect" title — the native rendering exists to
 * fix exactly that. A bare request (no usable reason — both an absent one
 * and a blank one are valid per the CDP validator; see `proseReason`) still
 * gets one honest line so the panel is never a dead-end title.
 */
function SetupErrorPanel({ display }: { display: SetupDisplayDetail }) {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Setup needs attention</p>
        <p className={styles.subtitle}>
          {proseReason(display) ??
            'The Art Computer ran into a problem with setup mode. It will keep trying automatically.'}
        </p>
      </div>
    </section>
  );
}

/*
 * Title + reason only — no "rejoin and try again" instruction. join_failed
 * is a transient frame: the provisioning machine re-raises the AP after ANY
 * join failure and the narration re-renders softap_qr, so the QR screen
 * that follows IS the rejoin instruction (the cross-repo contract is
 * ffos-user docs/setup-flow.md, "Join and the AP bounce": every failure
 * class re-raises the AP; setupui narrates join_failed, then softap_qr on
 * AP-up). The reason string from controld already carries the action
 * ("Please check it and try again."), and the phone gets the same reason
 * as a banner on the portal picker. A bare join_failed (no usable reason —
 * both an absent one and a blank one are valid per the CDP validator; see
 * `proseReason`) still gets one actionable line so the panel is never a
 * dead-end title while the re-raise is in flight.
 */
function JoinFailedPanel({ display }: { display: SetupDisplayDetail }) {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Couldn&apos;t connect to Wi-Fi</p>
        <p className={styles.subtitle}>
          {proseReason(display) ?? 'Please try again.'}
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
        {/* Same warning as factory reset: the screen may sit on a percent
            for a while and a watcher's worst move is pulling the plug
            mid-write. If the OTA path is provably power-loss-safe end to
            end, this line can go — flagged for controld review. */}
        <p className={styles.subtitle}>Don&apos;t unplug it.</p>
      </div>
    </section>
  );
}

function FactoryResetPanel() {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Resetting to factory settings</p>
        <p className={styles.subtitle}>Don&apos;t unplug it.</p>
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
 * frame manually inside the app — "look for <name>" is the one instruction
 * that routes both cases without a separate screen. The QR code is
 * deliberately framed as the backup for when discovery fails (cross-VLAN,
 * multicast-filtering APs, or the phone on a different network).
 */
function ClaimQrPanel({ display }: { display: SetupDisplayDetail }) {
  const frameName = display.device_name?.trim();
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Pair with the Feral File app</p>
        {/* "Look for <name>" covers both discovery cases in two words: on a
            first claim the app auto-prompts (the frame appears), and on an
            already-claimed frame the user finds it via manual add. The old
            "If pairing doesn't start automatically, add ... in the app"
            conditional routed the second case explicitly; looking for the
            name routes both. */}
        <p className={styles.subtitle}>
          Open the app on a phone on the same Wi-Fi and look for{' '}
          {frameName ? (
            <strong>{frameName}</strong>
          ) : (
            'this Art Computer'
          )}
          .
        </p>
        {display.url ? (
          <>
            <p className={styles.stepLabel}>Or scan this code.</p>
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

    case SetupDisplayState.Connecting: {
      return <ConnectingPanel display={display} />;
    }

    case SetupDisplayState.SetupError: {
      return <SetupErrorPanel display={display} />;
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
