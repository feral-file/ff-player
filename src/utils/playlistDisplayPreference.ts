import * as Sentry from '@sentry/nextjs';

import {
  defaultDP1DisplayPreference,
  type DP1Defaults,
  type DP1DisplayPreference,
  type DP1Item,
} from '@/models/dp1.model';
import { DP1Service } from '@/services/DP1Service';

/**
 * Log and report an error raised while resolving a playlist item's display
 * preference. Extracted from PlaylistClient to keep that playback surface
 * under its line budget (see ArtworkPlayer's note on preferring utils).
 */
export function reportPlaylistDisplayPreferenceError(
  phase: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const message = `[PlaylistClient] Error handling item display preference (${phase})`;
  console.error(
    message,
    error instanceof Error ? error.message : String(error)
  );
  if (error instanceof Error) {
    Sentry.captureException(error, {
      extra: { phase, ...extra },
    });
  } else {
    Sentry.captureMessage(message, {
      extra: {
        error: String(error),
        phase,
        ...extra,
      },
    });
  }
}

/**
 * Pure DP-1 display-preference merge for a playlist item, lowest to highest
 * priority: baked-in defaults → playlist defaults.display → ref-manifest
 * controls.display (pass via [refDisplay] when loaded) → item.override.display
 * → item.display. Synchronous so no-ref items can resolve their preference in
 * the same tick they enter the slot; the async ref-manifest layer is loaded
 * separately via [loadRefManifestDisplay].
 */
export function mergeItemDisplayPreference(
  dp1Item: DP1Item,
  playlistDefaults: DP1Defaults | null,
  refDisplay?: DP1DisplayPreference
): DP1DisplayPreference {
  return {
    ...defaultDP1DisplayPreference,
    ...(playlistDefaults?.display ?? {}),
    ...(refDisplay ?? {}),
    ...(dp1Item.override?.display ?? {}),
    ...(dp1Item.display ?? {}),
  };
}

/**
 * Load the display preference carried by an item's `ref` manifest, or
 * undefined when the item has no ref or the manifest cannot be fetched.
 * Fetch failures are reported and swallowed so the merge continues with the
 * synchronous layers only — a missing manifest must not blank the artwork.
 */
export async function loadRefManifestDisplay(
  dp1Item: DP1Item
): Promise<DP1DisplayPreference | undefined> {
  if (!dp1Item.ref) {
    return undefined;
  }
  try {
    // TODO: Implement ref hash verification
    const manifest = await DP1Service.getItemRef(dp1Item.ref);
    return manifest?.controls?.display;
  } catch (error: unknown) {
    reportPlaylistDisplayPreferenceError('getItemRef', error, {
      ref: dp1Item.ref,
      itemId: dp1Item.id,
    });
    return undefined;
  }
}
