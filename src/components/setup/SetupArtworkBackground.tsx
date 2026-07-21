'use client';

import { useContext } from 'react';
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
 * Full-screen artwork layer rendered by SetupOverlay beneath its panels so
 * setup states play over art instead of a black void. Deliberately NOT cast
 * through CanvasService: a cast would be persisted as the device's castInfo
 * (useCastInfo writes every notified cast) and mask the real fallback
 * playlist on the next boot, which is compatibility-sensitive boot-recovery
 * behavior this layer must not touch.
 *
 * Renders only while no cast is active: when castInfo exists the player is
 * already showing the user's artwork behind the overlay scrim (e.g. an OTA
 * `updating` state over live playback), and this layer must not cover it.
 * The context read is optional (not `useAppContext`) so the overlay still
 * works when mounted without an AppProvider, as its tests do.
 */
export default function SetupArtworkBackground() {
  const castInfo = useContext(AppContext)?.context.castInfo ?? null;

  if (castInfo) {
    return null;
  }

  return (
    <iframe
      className={styles.background}
      src={setupArtworkUrl}
      // Same sandbox the artwork player grants HTML artworks; same-origin is
      // required for the artwork to load its sibling p5.min.js.
      sandbox="allow-same-origin allow-scripts"
      title="Setup background artwork"
    />
  );
}
