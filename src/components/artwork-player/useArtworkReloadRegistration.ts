import { useCallback, useEffect, useState } from 'react';

/**
 * Bumps a tick consumed by the previewURL effect so the same URL can re-run the
 * full load path (e.g. `refreshArtwork` after the host cleared HTTP cache).
 * When `onRegisterArtworkReload` is set, the parent receives `performReload` and
 * must clear it with `null` on teardown (handled here).
 */
export function useArtworkReloadRegistration(
  onRegisterArtworkReload?: (reload: (() => void) | null) => void
): number {
  const [artworkReloadTick, setArtworkReloadTick] = useState(0);
  const performArtworkReload = useCallback(() => {
    setArtworkReloadTick(n => n + 1);
  }, []);

  useEffect(() => {
    if (!onRegisterArtworkReload) {
      return;
    }
    onRegisterArtworkReload(performArtworkReload);
    return () => {
      onRegisterArtworkReload(null);
    };
  }, [onRegisterArtworkReload, performArtworkReload]);

  return artworkReloadTick;
}
