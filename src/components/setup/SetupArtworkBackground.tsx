'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import styles from './SetupArtworkBackground.module.scss';

/**
 * Bundled artwork shipped in `public/setup-artwork/` (source:
 * https://generator.artblocks.io/1/0x0000000c687daed0fba60d1dba4e5f6149e8b894/55,
 * saved with a local copy of p5.js instead of the CDN reference). It must be
 * same-origin and fully offline-capable: the setup flow runs on a
 * factory-fresh device before any Wi-Fi exists, so a remote URL would never
 * load exactly when this background is most needed.
 */
const setupArtworkUrl = '/setup-artwork/index.html';

/**
 * How long the iframe stays mounted after its show condition goes false, so
 * the CSS opacity fade can play. Matches ArtworkPlayer's
 * FADE_IN_OUT_DURATION_MS (650ms) — the setup artwork exits exactly like any
 * outgoing artwork on a cast command. Keep in sync with the transition in
 * SetupArtworkBackground.module.scss. Exported for the SetupOverlay tests.
 */
export const FADE_OUT_MS = 650;

/**
 * How long the backdrop may keep covering a still-degraded artwork AFTER
 * connectivity returns. Field bug: dropping the backdrop on the connectivity
 * edge revealed whatever the offline load left behind (a blank slot, or —
 * before ArtworkPlayer stopped committing them — Chromium's in-iframe
 * net-error page) for the few seconds the reconnect-recovery remount needs.
 * The right exit signal is `playbackDegraded` going false (the artwork
 * actually recovered), and the normal path is exactly that: the recovery
 * refresh fires on the same online edge and the remounted artwork crossfades
 * in over this layer. The cap exists only for the artwork that stays broken
 * while online (dead asset) — that case is documented ArtworkPlayer error
 * modal territory, and this z-999 layer must eventually yield to it.
 * Generous relative to a normal recovery (immediate refresh + asset fetch is
 * seconds) but far below the 15s/60s/240s retry ladder's later rungs.
 */
export const RECOVERY_HANDOVER_MS = 30_000;

/**
 * Boot-settle window for the status chip. A cold boot races Wi-Fi
 * association: the page paints one to two seconds before the interface is
 * even up (observed ~5s to WAN on the field device), so an immediate
 * "No internet connection" is an alarming claim about what is actually a
 * routine connect-in-progress. While the browser has NEVER been online this
 * page lifetime and this window has not elapsed, the chip reads
 * "Connecting to the internet…" instead. A device that was online and lost
 * the link skips the soft text entirely — that outage is real from its
 * first frame.
 */
export const CONNECTING_GRACE_MS = 60_000;

/**
 * Full-screen artwork layer rendered by SetupOverlay beneath its panels so
 * setup states play over art instead of a black void. Deliberately NOT cast
 * through CanvasService: a cast would be persisted as the device's castInfo
 * (useCastInfo writes every notified cast) and mask the real fallback
 * playlist on the next boot, which is compatibility-sensitive boot-recovery
 * behavior this layer must not touch.
 *
 * Two situations put it on screen, and one invariant keeps it off.
 *
 * 1. A setup panel is visible and nothing is cast — the original case.
 * 2. `offlineDegraded`: the device has no connectivity AND the artwork the
 *    player is trying to show failed to load. A claimed device that boots
 *    offline restores its playlist but cannot fetch any asset, so without
 *    this the wall is simply black. The bundled artwork is the only thing
 *    guaranteed to render with zero connectivity, which is exactly why it
 *    is same-origin and offline-complete.
 *
 * Case 2 exits on RECOVERY, not on reconnect: connectivity returning while
 * the artwork is still degraded keeps the layer up (bounded — see
 * RECOVERY_HANDOVER_MS) so the broken slot underneath is never revealed
 * during the remount; the recovered artwork crossfades in over it.
 *
 * The invariant: a device that is playing artwork normally must NEVER get
 * this layer over it. That is what the `!castInfo || degradedBackdrop`
 * factor enforces — an OTA `updating` panel raised over live playback still
 * shows the user's artwork through the panel scrim, unchanged.
 *
 * On exit it fades out over the player's standard cast-fade duration instead
 * of vanishing in a hard cut, then unmounts.
 *
 * The context read is optional (not `useAppContext`) so the overlay still
 * works when mounted without an AppProvider, as its tests do; the defaults
 * read as "online and playing fine", which leaves setup behavior unchanged.
 */
/**
 * Second, level-triggered source of offline evidence, alongside the daemon
 * signal. `isOnline` is now level-correct in its own right (the daemon
 * replays connectivity on every generation-ready, and `useNetworkManger`
 * seeds from the `DaemonConnectivity` store — see DEVICE_LOCAL_PLAYER.md),
 * but `navigator.onLine` still adds daemon-independent coverage: it reads
 * the browser's own interface state, so a reload while the link is
 * physically down is caught even if the daemon or its replay is unavailable.
 * It cannot see "associated but no internet" — including the device's own
 * setup AP holding the interface up — so it widens coverage rather than
 * replacing the daemon signal; false positives are not a concern (interface
 * down ⟹ genuinely offline). Scoped to this component on purpose: other
 * `isOnline` consumers (streaming pause) keep their daemon-driven semantics.
 */
function useBrowserOnline(): boolean {
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
    };
    const handleOffline = () => {
      setBrowserOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return browserOnline;
}

/**
 * Recovery handover latch. `offlineDegraded` alone drops the backdrop on the
 * connectivity edge — while `playbackDegraded` is still true and the
 * reconnect-recovery remount is still in flight, which put the broken slot
 * on screen for a few seconds after every offline boot. Once the backdrop
 * has been raised for offline degradation, it stays up until the artwork
 * actually recovers (`playbackDegraded` false — the remounted artwork then
 * crossfades in over this layer), bounded by RECOVERY_HANDOVER_MS so a
 * permanently-broken-but-online artwork still falls through to
 * ArtworkPlayer's own error modal, which this layer must not cover
 * indefinitely.
 */
function useRecoveryHold(
  offlineDegraded: boolean,
  playbackDegraded: boolean
): boolean {
  const [recoveryHold, setRecoveryHold] = useState(false);
  useEffect(() => {
    if (offlineDegraded) {
      setRecoveryHold(true);
      return undefined;
    }
    if (!playbackDegraded) {
      setRecoveryHold(false);
      return undefined;
    }
    const timer = setTimeout(() => {
      setRecoveryHold(false);
    }, RECOVERY_HANDOVER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [offlineDegraded, playbackDegraded]);
  return recoveryHold;
}

/**
 * Chip escalation (see CONNECTING_GRACE_MS): returns true while the soft
 * "Connecting…" text still applies — the browser has never been online this
 * page lifetime and the boot-settle window is still open.
 */
function useBootConnectingWindow(browserOnline: boolean): boolean {
  const [graceElapsed, setGraceElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setGraceElapsed(true);
    }, CONNECTING_GRACE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  const everBrowserOnlineRef = useRef(browserOnline);
  useEffect(() => {
    if (browserOnline) {
      everBrowserOnlineRef.current = true;
    }
  }, [browserOnline]);
  return !everBrowserOnlineRef.current && !graceElapsed;
}

export default function SetupArtworkBackground({
  panelVisible,
}: {
  panelVisible: boolean;
}) {
  const appContext = useContext(AppContext)?.context;
  const castInfo = appContext?.castInfo ?? null;
  const isOnline = appContext?.isOnline ?? true;
  const playbackDegraded = appContext?.playbackDegraded ?? false;
  const browserOnline = useBrowserOnline();
  const offlineNow = !isOnline || !browserOnline;
  const offlineDegraded = offlineNow && playbackDegraded;

  // The `&& playbackDegraded` matters on the exit render: recovery clears
  // the flag before the hold effect has run, and the backdrop must start
  // its fade on that very render, not one effect-tick later.
  const recoveryHold = useRecoveryHold(offlineDegraded, playbackDegraded);
  const degradedBackdrop =
    offlineDegraded || (recoveryHold && playbackDegraded);

  // Both factors are gated on the degraded backdrop, not the bare degraded
  // flag. An artwork that fails while the device is ONLINE is a different
  // problem — a broken asset or an unsupported format, which ArtworkPlayer
  // already reports through its own error modal — and covering that modal
  // with this z-index 999 layer would replace the diagnostic with a p5
  // sketch.
  const show =
    (panelVisible || degradedBackdrop) && (!castInfo || degradedBackdrop);

  // The panel owns the messaging whenever one is up (a re-provision QR over
  // a long-offline device already explains the situation), so the chip only
  // speaks for the bare backdrop — and only while the device is actually
  // offline. During the online handover (recoveryHold, artwork remounting)
  // any offline claim would be false, so the backdrop rides chipless for
  // those seconds and the chip's disappearance itself signals "connection
  // restored".
  const bootConnecting = useBootConnectingWindow(browserOnline);
  const chipText =
    degradedBackdrop && offlineNow && !panelVisible
      ? bootConnecting
        ? 'Connecting to the internet…'
        : 'No internet connection'
      : null;

  // Mounted lags `show` by FADE_OUT_MS on the way out so the fade can play;
  // re-showing during the fade cancels the pending unmount and the same
  // iframe node returns to full opacity (no remount — a remount would
  // restart the generative piece).
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      return undefined;
    }
    const timer = setTimeout(() => {
      setMounted(false);
    }, FADE_OUT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [show]);

  // Latched to the last on-screen value so the chip fades out WITH the
  // artwork it labels instead of hard-cutting when `show` drops (e.g. the
  // degraded flag clearing mid-fade). Latched in an effect, not the render
  // body, so render stays pure; on the exit render the effect has not yet
  // overwritten the ref, which is precisely the last-shown value the fade
  // needs.
  const lastChipRef = useRef(chipText);
  useEffect(() => {
    if (show) {
      lastChipRef.current = chipText;
    }
  }, [show, chipText]);
  const renderChipText = show ? chipText : lastChipRef.current;

  if (!mounted) {
    return null;
  }

  // The chip lives inside this layer rather than in a new overlay surface so
  // it inherits the same mount lifetime and the same exit fade as the
  // artwork it labels — the opacity transition is on the wrapper.
  return (
    <div className={show ? styles.layer : `${styles.layer} ${styles.fading}`}>
      <iframe
        className={styles.background}
        src={setupArtworkUrl}
        // allow-scripts ONLY. The artwork is an inline p5 sketch plus a
        // classic sibling <script src="./p5.min.js"> — neither needs a
        // same-origin browsing context (classic script loads work from an
        // opaque origin; the sketch touches no storage, no fetch, no parent).
        // Granting allow-same-origin alongside allow-scripts would let this
        // same-origin document reach the parent and strip its own sandbox
        // attribute, defeating the boundary entirely.
        sandbox="allow-scripts"
        title="Setup background artwork"
      />
      {renderChipText ? (
        <p className={styles.statusChip} aria-live="polite">
          {renderChipText}
        </p>
      ) : null}
    </div>
  );
}
