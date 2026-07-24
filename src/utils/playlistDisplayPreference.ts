import * as Sentry from '@sentry/nextjs';

import {
  defaultDP1DisplayPreference,
  type DP1Defaults,
  type DP1DisplayPreference,
  type DP1Item,
  type RefManifest,
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
 * Upper bound on how long the display-preference merge waits for a ref
 * manifest before applying the synchronous layers. The slot timer holds the
 * device default duration back until a merge lands (so a manifest-carried
 * artist veto is never beaten by a fetch); this bound guarantees a merge
 * always lands, so the owner's setting is deferred briefly, never dropped.
 * A manifest resolving after the bound is still honored when it arrives —
 * the bound only stops the timer gate from waiting, it discards nothing.
 */
export const REF_MANIFEST_GATE_TIMEOUT_MS = 10_000;

/**
 * Load the display preference carried by an item's `ref` manifest, or
 * undefined when the item has no ref or the manifest cannot be fetched.
 * Fetch failures are reported and swallowed — a missing manifest must not
 * blank the artwork or strand the slot timer.
 */
// Session cache of resolved manifest display preferences by ref URL. A slow
// manifest can only lose the pre-advance veto race once per session: after it
// resolves — however late — every later visit to any slot with that ref gets
// its gates synchronously, before any timer arms. Failures are not cached so
// transient fetch errors retry on the next visit.
const refDisplayCache = new Map<string, DP1DisplayPreference | undefined>();

/**
 * Human-readable label data from a ref manifest's metadata block
 * (dp1 core/v1.1.0 ref-manifest.md §4), consumed by the tombstone overlay
 * (feral-file#3452). Cached beside the display preference so the label rides
 * the same single fetch, the same refHash version identity, and the same
 * per-cast invalidation instead of growing a second manifest-fetch layer.
 */
export interface RefManifestLabel {
  artistNames?: string;
  title?: string;
}

const refLabelCache = new Map<string, RefManifestLabel | undefined>();

/**
 * Cache identity for a ref manifest. DP-1 models refHash as the integrity /
 * version identity of an HTTPS ref, so a refreshed item with the same URL but
 * a different refHash must not inherit a prior manifest's display authority.
 */
function refCacheKey(dp1Item: DP1Item): string {
  return `${dp1Item.ref ?? ''}#${dp1Item.refHash ?? ''}`;
}

/** Test hook: reset the session ref-display cache. */
export function clearRefManifestDisplayCache(): void {
  refDisplayCache.clear();
  refLabelCache.clear();
  refManifestInFlight.clear();
}

/**
 * Drop cached displays for refs without a refHash. Hash-less refs have no
 * version identity, so a fresh cast is the only safe refresh boundary for
 * them; hashed entries are content-addressed and stay valid for the session.
 */
export function clearUnversionedRefManifestDisplayCache(): void {
  for (const key of Array.from(refDisplayCache.keys())) {
    if (key.endsWith('#')) {
      refDisplayCache.delete(key);
    }
  }
  for (const key of Array.from(refLabelCache.keys())) {
    if (key.endsWith('#')) {
      refLabelCache.delete(key);
    }
  }
  // Also drop hash-less in-flight entries: without this, one hung manifest
  // request would pin its key for the whole session — every later visit
  // would join the dead promise instead of retrying. Dropping the entry
  // doesn't cancel existing awaiters; it only lets the next cast's visitors
  // start a fresh attempt.
  for (const key of Array.from(refManifestInFlight.keys())) {
    if (key.endsWith('#')) {
      refManifestInFlight.delete(key);
    }
  }
}

/**
 * Load the display preference carried by an item's `ref` manifest, or
 * undefined when the item has no ref or the manifest cannot be fetched.
 * Resolved results are session-cached by ref URL; fetch failures are
 * reported, swallowed, and left uncached so they retry on the next visit.
 */
// In-flight manifest loads by cache key. The display-preference path and the
// tombstone label path can request the same manifest in the same tick (both
// caches miss until the fetch resolves); sharing the pending promise keeps
// that to one getItemRef call per ref version.
const refManifestInFlight = new Map<
  string,
  Promise<DP1DisplayPreference | undefined>
>();

/**
 * Fetches and caches a ref manifest's display preference. Concurrent callers
 * for the same ref version share the in-flight promise (one getItemRef per
 * version); the resolved manifest also populates the tombstone label cache.
 *
 * Deliberately a flat `.then(onFulfilled, onRejected)` chain rather than an
 * async wrapper: the slot-timer harness resolves late manifests under fake
 * timers with a tight microtask budget, and every extra promise-adoption hop
 * (async-returning-promise, separate catch/finally links) delays the apply
 * past the flushes the veto path gets. Keep resolution one tick deep.
 */
export function loadRefManifestDisplay(
  dp1Item: DP1Item
): Promise<DP1DisplayPreference | undefined> {
  if (!dp1Item.ref) {
    return Promise.resolve(undefined);
  }
  const cacheKey = refCacheKey(dp1Item);
  if (refDisplayCache.has(cacheKey)) {
    return Promise.resolve(refDisplayCache.get(cacheKey));
  }
  const inFlight = refManifestInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }
  // TODO: Implement ref hash verification
  const load = DP1Service.getItemRef(dp1Item.ref).then(
    manifest => {
      refManifestInFlight.delete(cacheKey);
      const display = manifest?.controls?.display;
      refDisplayCache.set(cacheKey, display);
      refLabelCache.set(cacheKey, extractManifestLabel(manifest?.metadata));
      return display;
    },
    (error: unknown) => {
      refManifestInFlight.delete(cacheKey);
      reportPlaylistDisplayPreferenceError('getItemRef', error, {
        ref: dp1Item.ref,
        itemId: dp1Item.id,
      });
      return undefined;
    }
  );
  refManifestInFlight.set(cacheKey, load);
  return load;
}

/**
 * Narrows a manifest metadata block into the tombstone's label fields.
 * Defensive despite the RefManifestMetadata type: manifests are remote JSON
 * and a malformed artists array must degrade to a missing line, not a crash.
 * Exported because the same block shape can ride inline on a playlist item
 * (`DP1Item.metadata`, the tolerant read for ref-less playlists).
 */
export function extractManifestLabel(
  metadata: RefManifest['metadata']
): RefManifestLabel | undefined {
  if (!metadata) {
    return undefined;
  }
  const names = Array.isArray(metadata.artists)
    ? metadata.artists
        .map(artist => (typeof artist.name === 'string' ? artist.name : null))
        .filter((name): name is string => Boolean(name))
    : [];
  return {
    artistNames: names.length > 0 ? names.join(', ') : undefined,
    title: typeof metadata.title === 'string' ? metadata.title : undefined,
  };
}

/**
 * Resolve the tombstone label carried by an item's ref manifest, riding the
 * same fetch and caches as the display preference. Undefined when the item
 * has no ref, the manifest cannot be fetched, or it carries no metadata.
 */
export async function loadRefManifestLabel(
  dp1Item: DP1Item
): Promise<RefManifestLabel | undefined> {
  if (!dp1Item.ref) {
    return undefined;
  }
  const cacheKey = refCacheKey(dp1Item);
  if (refLabelCache.has(cacheKey)) {
    return refLabelCache.get(cacheKey);
  }
  await loadRefManifestDisplay(dp1Item);
  return refLabelCache.get(cacheKey);
}

/**
 * Resolve and apply the display preference for a playlist slot.
 *
 * No-ref items apply their merge synchronously (first render is not deferred
 * by a microtask). Ref items wait for the manifest up to
 * REF_MANIFEST_GATE_TIMEOUT_MS; if it has not resolved by then, the merge is
 * applied with the synchronous layers so the slot timer can proceed, and the
 * original fetch is kept alive: a manifest that resolves late is re-applied
 * so its display preferences (veto, loop, scaling, background, interaction)
 * still take effect for the slot. [apply] is invoked once or twice and must
 * guard against stale slots itself.
 */
export async function resolveAndApplyItemDisplayPreference(
  dp1Item: DP1Item,
  playlistDefaults: DP1Defaults | null,
  apply: (merged: DP1DisplayPreference) => void
): Promise<void> {
  try {
    if (!dp1Item.ref) {
      apply(mergeItemDisplayPreference(dp1Item, playlistDefaults));
      return;
    }

    const refPromise = loadRefManifestDisplay(dp1Item);
    const timedOut = Symbol('refManifestTimeout');
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const raced = await Promise.race([
      refPromise,
      new Promise<typeof timedOut>(resolve => {
        timeoutHandle = setTimeout(() => {
          resolve(timedOut);
        }, REF_MANIFEST_GATE_TIMEOUT_MS);
      }),
    ]).finally(() => {
      clearTimeout(timeoutHandle);
    });

    if (raced !== timedOut) {
      apply(mergeItemDisplayPreference(dp1Item, playlistDefaults, raced));
      return;
    }

    // Bounded merge now so the slot timer is not stranded...
    apply(mergeItemDisplayPreference(dp1Item, playlistDefaults));
    // ...but keep listening: a late manifest still owns display authority.
    const late = await refPromise;
    if (late !== undefined) {
      apply(mergeItemDisplayPreference(dp1Item, playlistDefaults, late));
    }
  } catch (error: unknown) {
    reportPlaylistDisplayPreferenceError('mergeOrApplyDisplayPreference', error, {
      itemId: dp1Item.id,
      ref: dp1Item.ref,
    });
    apply(defaultDP1DisplayPreference);
  }
}
