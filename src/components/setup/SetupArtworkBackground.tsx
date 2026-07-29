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
 * The invariant: a device that is playing artwork normally must NEVER get
 * this layer over it. That is what the `!castInfo || offlineDegraded` factor
 * enforces — an OTA `updating` panel raised over live playback still shows
 * the user's artwork through the panel scrim, unchanged.
 *
 * On exit it fades out over the player's standard cast-fade duration instead
 * of vanishing in a hard cut, then unmounts.
 *
 * The context read is optional (not `useAppContext`) so the overlay still
 * works when mounted without an AppProvider, as its tests do; the defaults
 * read as "online and playing fine", which leaves setup behavior unchanged.
 */
export default function SetupArtworkBackground({
  panelVisible,
}: {
  panelVisible: boolean;
}) {
  const appContext = useContext(AppContext)?.context;
  const castInfo = appContext?.castInfo ?? null;
  const isOnline = appContext?.isOnline ?? true;
  const playbackDegraded = appContext?.playbackDegraded ?? false;
  const offlineDegraded = !isOnline && playbackDegraded;
  // Both factors are gated on `offlineDegraded`, not the bare degraded flag.
  // An artwork that fails while the device is ONLINE is a different problem
  // — a broken asset or an unsupported format, which ArtworkPlayer already
  // reports through its own error modal — and covering that modal with this
  // z-index 999 layer would replace the diagnostic with a p5 sketch.
  const show =
    (panelVisible || offlineDegraded) && (!castInfo || offlineDegraded);
  // The panel owns the messaging whenever one is up (a re-provision QR over
  // a long-offline device already explains the situation), so the chip only
  // speaks for the bare backdrop.
  const showOfflineChip = offlineDegraded && !panelVisible;

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
  // artwork it labels instead of hard-cutting. The usual exit is exactly the
  // case that would break: connectivity returns, so `offlineDegraded` goes
  // false in the same render that starts the 650ms fade.
  const lastChipRef = useRef(showOfflineChip);
  if (show) {
    lastChipRef.current = showOfflineChip;
  }
  const renderChip = show ? showOfflineChip : lastChipRef.current;

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
      {renderChip ? (
        <p className={styles.statusChip} aria-live="polite">
          No internet connection
        </p>
      ) : null}
    </div>
  );
}
