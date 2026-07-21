'use client';

import { useContext, useEffect, useState } from 'react';
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
 * Shows while a panel is visible and no cast is active: when castInfo exists
 * the player is already showing the user's artwork behind the overlay scrim
 * (e.g. an OTA `updating` state over live playback), and this layer must not
 * cover it. On exit (overlay hides or a cast starts) it fades out over the
 * player's standard cast-fade duration instead of vanishing in a hard cut,
 * then unmounts.
 *
 * The context read is optional (not `useAppContext`) so the overlay still
 * works when mounted without an AppProvider, as its tests do.
 */
export default function SetupArtworkBackground({
  panelVisible,
}: {
  panelVisible: boolean;
}) {
  const castInfo = useContext(AppContext)?.context.castInfo ?? null;
  const show = panelVisible && !castInfo;

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

  if (!mounted) {
    return null;
  }

  return (
    <iframe
      className={
        show ? styles.background : `${styles.background} ${styles.fading}`
      }
      src={setupArtworkUrl}
      // Same sandbox the artwork player grants HTML artworks; same-origin is
      // required for the artwork to load its sibling p5.min.js.
      sandbox="allow-same-origin allow-scripts"
      title="Setup background artwork"
    />
  );
}
