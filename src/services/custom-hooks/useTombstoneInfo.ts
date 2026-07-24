'use client';

import { DP1Item } from '@/models/dp1.model';
import {
  extractManifestLabel,
  loadRefManifestLabel,
  RefManifestLabel,
} from '@/utils/playlistDisplayPreference';
import { useEffect, useMemo, useState } from 'react';

/**
 * Resolves tombstone label metadata for the playing item (feral-file#3452).
 *
 * The DP-1 item itself only carries `title`; artist names live in the item's
 * ref-manifest. Resolution rides the same fetch, cache, and refHash version
 * identity as the display-preference layer (`loadRefManifestLabel`), so a
 * label lookup never issues a second manifest request. Items without a ref
 * label with their playlist title, so playlists built by today's ff-cli get a
 * meaningful tombstone. Failures are silent by design: a missing label line
 * must never disturb playback.
 */
export function useTombstoneInfo(item: DP1Item | undefined) {
  // The resolved label is stored WITH the item id it belongs to and checked
  // synchronously at read time. State alone would lag one render behind an
  // item change (effects run post-render), letting the new item's key render
  // with the previous item's artist/title — a brief misidentification the
  // label must never show.
  const [labelEntry, setLabelEntry] = useState<{
    forItemId: string;
    label: RefManifestLabel;
  } | null>(null);
  const itemId = item?.id ?? '';

  useEffect(() => {
    if (!item?.ref) {
      return;
    }
    // Stale-result guard rather than an abort: the underlying fetch is shared
    // with the display-preference layer (a late manifest still feeds its
    // session cache); this effect only refuses to apply a label after the
    // item has moved on.
    let stale = false;
    loadRefManifestLabel(item)
      .then(label => {
        if (!stale && label) {
          setLabelEntry({ forItemId: itemId, label });
        }
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [item, itemId]);

  const manifestLabel =
    labelEntry !== null && labelEntry.forItemId === itemId
      ? labelEntry.label
      : null;

  // Inline metadata carried on the item itself (ref-less playlists, e.g.
  // ff-cli builds). Sits below the ref manifest in precedence.
  const inlineLabel = useMemo(
    () => (item?.metadata ? extractManifestLabel(item.metadata) : undefined),
    [item]
  );

  return {
    artistName: manifestLabel?.artistNames ?? inlineLabel?.artistNames,
    // Manifest titles are richer (e.g. include the year); prefer them, then
    // inline metadata, then the playlist item's own title.
    title: manifestLabel?.title ?? inlineLabel?.title ?? item?.title,
  };
}
