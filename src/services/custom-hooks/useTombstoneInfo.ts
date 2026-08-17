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
 * The DP-1 item itself only carries `title`; artist names live in a Ref
 * Manifest, which reaches us by one of two carriages. A `ref` is fetched, and
 * that resolution rides the same fetch, cache, and refHash version identity as
 * the display-preference layer (`loadRefManifestLabel`), so a label lookup
 * never issues a second manifest request. An `inlineManifest` (§3.6) is
 * already in hand and needs no effect at all. Items with neither label with
 * their playlist title, so playlists built by today's ff-cli get a meaningful
 * tombstone. Failures are silent by design: a missing label line must never
 * disturb playback.
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

  // A complete Ref Manifest carried on the item (playlists extension §3.6).
  // Same document as a fetched ref manifest, just a different carriage, so it
  // reads through the same extractor — but synchronously, with no fetch to
  // fail and no gate to wait on.
  const inlineManifestLabel = useMemo(
    () => extractManifestLabel(item?.inlineManifest?.metadata),
    [item]
  );

  // ONE of the two carriages wins outright, rather than the fields falling
  // through independently. `ref` and `inlineManifest` are two deliveries of
  // the same document (§3.6), so resolving them per document is what the
  // spec describes — dp1-go states the same rule for non-display fields in
  // merge.ManifestForItem. It also avoids a specific wrong tombstone: a
  // fetched manifest carrying a title but no artists would otherwise print
  // this document's title above the other document's artist line, and the
  // two lines name a single work.
  //
  // Display preferences deliberately do NOT follow this rule — they layer
  // per key in mergeItemDisplayPreference — because a display block is a set
  // of independent knobs, not a description of one thing.
  const label = manifestLabel ?? inlineManifestLabel;

  // Inline metadata carried on the item itself (ref-less playlists, e.g.
  // ff-cli builds). The non-standard predecessor of inlineManifest; kept for
  // playlists already in the field, and outranked by it. Not a manifest
  // carriage, so it stays a per-field fallback as it has always been.
  const inlineLabel = useMemo(
    () => (item?.metadata ? extractManifestLabel(item.metadata) : undefined),
    [item]
  );

  return {
    artistName: label?.artistNames ?? inlineLabel?.artistNames,
    // Manifest titles are richer (e.g. include the year); prefer the manifest,
    // then the legacy inline metadata block, then the item's own title.
    title: label?.title ?? inlineLabel?.title ?? item?.title,
  };
}
