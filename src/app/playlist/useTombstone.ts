'use client';

import { DisplaySettings, TombstoneMode } from '@/models/display_settings.model';
import { DP1Item } from '@/models/dp1.model';
import { useTombstoneInfo } from '@/services/custom-hooks/useTombstoneInfo';
import { itemIdentityFor, normalizePlaylistIndex } from '@/utils/playlist';
import { coerceTombstoneMode, tombstoneToastText } from '@/utils/tombstoneMode';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Tombstone state for the playlist route (feral-file#3452), extracted to keep
 * PlaylistClient under its file budget.
 *
 * The central contract: the tombstone describes the artwork actually on the
 * wall. Selection (currentIndex) runs ahead of the wall on slow loads — the
 * outgoing artwork stays visible until incoming media is ready — so this hook
 * keys everything off ArtworkPlayer's transition-commit callback, never off
 * selection. A stale identity after a cast replaces the playlist resolves to
 * no item, which keeps the overlay hidden until the next commit fires.
 *
 * Also owns the FF1-side confirmation toast: the first observed settings
 * value primes silently (boot restore must not announce itself); only genuine
 * mode changes — a cast from ff-app — produce a toast.
 */
export function useTombstone(
  playlist: DP1Item[],
  deviceDisplaySettings: DisplaySettings | null
) {
  const [committedItemIdentity, setCommittedItemIdentity] = useState('');
  const handleItemCommitted = useCallback((identity: string) => {
    setCommittedItemIdentity(identity);
  }, []);

  const committedItem = useMemo(() => {
    if (committedItemIdentity === '' || playlist.length === 0) {
      return undefined;
    }
    return playlist.find(
      (unused, index) =>
        itemIdentityFor(playlist, normalizePlaylistIndex(index, playlist.length)) ===
        committedItemIdentity
    );
  }, [committedItemIdentity, playlist]);

  const { artistName, title } = useTombstoneInfo(committedItem);
  const mode = coerceTombstoneMode(deviceDisplaySettings?.tombstone);

  const previousModeRef = useRef<TombstoneMode | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  useEffect(() => {
    if (!deviceDisplaySettings) {
      return;
    }
    const previous = previousModeRef.current;
    previousModeRef.current = mode;
    if (previous !== null && previous !== mode) {
      setToastText(tombstoneToastText(mode));
    }
  }, [deviceDisplaySettings, mode]);

  return {
    handleItemCommitted,
    mode,
    itemKey: committedItemIdentity,
    title,
    artistName,
    toastText,
  };
}
