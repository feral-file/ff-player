'use client';

import { ReactElement, useContext, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CustomEventName,
  MintPairingDisplayDetail,
  MintPairingDisplayState,
  SetupDisplayDetail,
  SetupDisplayState,
  isSetupFlowState,
} from '@/models/custom_event';
import { AppContext } from '@/context/AppContext';
import { useSetupPanelCleared } from './setupPanelWindow';
import SetupArtworkBackground from './SetupArtworkBackground';
import styles from './SetupOverlay.module.scss';

const hiddenDisplay: SetupDisplayDetail = { state: SetupDisplayState.Hidden };

const qrSize = 320;

/**
 * controld's `reason` prose, or `undefined` when there is nothing worth
 * rendering. The CDP validator only checks that `reason` is a string, so an
 * empty or whitespace-only value is a valid command. Collapsing that to
 * absent keeps the join panel from rendering a blank line under its title.
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
 * The one setup QR: the WIFI: join code plus a direct on-link portal address
 * as text, never a second "open the portal" code beside it, which read as a
 * competing entry point. controld gets the address NetworkManager actually
 * assigned to the active hotspot and sends it as portal_url. Once the user
 * accepts the no-internet setup Wi-Fi, a literal on-link IP bypasses Private
 * DNS and cellular DNS entirely. Older controllers omit the optional field,
 * and this player then omits the manual-address instruction rather than
 * presenting an unreliable DNS name.
 *
 * `client_attached` (a phone is on the hotspot) does not change this panel:
 * the fallback lines below already carry the phone that got no prompt to the
 * setup page.
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
  // After a failed join (or once the attached phone left the hotspot) the
  // daemon sends the join QR back WITH a reason, and this line is the only
  // place the reason is visible on the device (the phone's picker carries
  // its own banner). It renders at the panel's compact scale, not the shared
  // .subtitle scale: at 1080p the full-size line wrapped to two rows and
  // pushed the last recovery cue below the bottom edge, and the join panel
  // is the densest setup layout.
  const joinFailure = proseReason(display);
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>
          Scan the QR code, then follow your phone&apos;s prompt to connect
        </p>
        {joinFailure ? (
          <p className={`${styles.subtitle} ${styles.softApSubtitle}`}>
            {joinFailure}
          </p>
        ) : null}
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

function JoiningPanel() {
  return (
    <section className={styles.overlay} aria-live="polite">
      <div className={styles.panel}>
        <p className={styles.title}>Connecting to Wi-Fi</p>
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
 * multicast-filtering APs). Either way the app asks for the frame's Wi-Fi:
 * it sets up a first owner only there, and the claim will only complete on
 * the LAN once the legacy relayer is gone (until then a code from this
 * screen can also enroll over it, ffos-user docs/ff1-control-v1.md §5.1).
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
        {/* The same-Wi-Fi requirement leads, as its own line: the app sets
            up a first owner only on the frame's Wi-Fi, so a phone on mobile
            data or another network cannot finish here. The last line asks
            to keep the code private, and must not promise more: while the
            legacy relayer exists the QR carries its topic, and the
            invitation in it can enroll over that relayer from anywhere
            (ffos-user docs/ff1-control-v1.md §5.1, §11). It must also stay
            true on every QR this panel shows: first claim, "Secure this Art
            Computer", and an owned frame's code for another phone, which
            carries no invitation and expires in no minutes. */}
        <p className={styles.subtitle}>
          Connect your phone to the same Wi-Fi as this Art Computer.
        </p>
        <p className={styles.stepLabel}>
          Then open the app and look for{' '}
          {frameName ? <strong>{frameName}</strong> : 'this Art Computer'}
          {display.url ? ', or scan this code.' : '.'}
        </p>
        {display.url ? (
          <>
            <div className={styles.qrFrame}>
              <QRCodeSVG value={display.url} size={qrSize} marginSize={2} />
            </div>
            <p className={styles.securityNote}>
              Keep this code private: it can be used to pair with this Art
              Computer.
            </p>
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
    case SetupDisplayState.SoftApQr: {
      return <SoftApQrPanel display={display} />;
    }

    case SetupDisplayState.Joining: {
      return <JoiningPanel />;
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

    // Narration-only states paint nothing: a screen stays only when the
    // person has to do something or has to not do something
    // (feral-file/feral-file#3635). The controller still sends them, and
    // they are accepted and ignored.
    case SetupDisplayState.Scanning:
    case SetupDisplayState.Connecting:
    case SetupDisplayState.Finalizing:
    case SetupDisplayState.JoinFailed:
    case SetupDisplayState.SetupError:
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
 * Any setup-flow state, with or without a panel, gets the bundled artwork
 * (see SetupArtworkBackground for why it's iframe-based and cast-gated), so
 * a unit with nothing saved never waits on a black screen. The background is
 * a stable, ALWAYS-rendered sibling of the panel: it stays
 * mounted — and the artwork keeps running uninterrupted — across setup state
 * transitions, and it must stay in the tree when the overlay hides so it can
 * play its exit fade (the player's standard cast fade) instead of
 * hard-cutting off screen; it unmounts itself once that fade completes.
 *
 * On a unit with a saved work to display, the join code clears after about a
 * minute; `setupPanelWindow.ts` owns that timing.
 */
export default function SetupOverlay() {
  const [display, setDisplay] = useState<SetupDisplayDetail>(hiddenDisplay);

  useEffect(() => {
    const handleDisplay = (event: Event) => {
      const { detail } = event as CustomEvent<SetupDisplayDetail>;
      if (detail.state === (SetupDisplayState.SetupError as string)) {
        // No panel for this state; the log line keeps it diagnosable.
        console.warn('[SetupOverlay] setup_error:', detail.reason ?? '');
      }
      setDisplay(detail);
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

  // A unit with a saved work to display clears the join code after about a
  // minute so the work shows with nothing over it (see
  // SETUP_PANEL_WINDOW_MS). The context read is optional for the same reason
  // as in SetupArtworkBackground; without a provider nothing is saved and
  // every panel stays, as on a unit that was never set up. "Saved" means a
  // playlist with at least one work: cast state alone is not enough, because
  // `setLoop` on a unit with no artwork persists a cast with only a command
  // and a loop mode, and clearing the panel there would leave a blank screen.
  const appContext = useContext(AppContext)?.context;
  const cleared = useSetupPanelCleared(
    display,
    (appContext?.castInfo?.playlist?.items?.length ?? 0) > 0,
    appContext?.isOnline ?? true
  );
  const panel = cleared ? null : renderSetupPanel(display);

  return (
    <>
      <SetupArtworkBackground
        setupActive={isSetupFlowState(display.state)}
        panelVisible={panel !== null}
      />
      {panel}
    </>
  );
}
