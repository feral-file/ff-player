import { DP1Call, DP1Item } from '@/models/dp1.model';

/** Unsigned playback origin; defaults and unclassified casts are curated. */
export type ContentContext = 'curated' | 'personal';

/** Device policy. Only the daemon may set the archive-audit gate. */
export interface ContentPolicy {
  version: 1;
  showMatureContent: boolean;
  strictPersonal: boolean;
  blockUnratedCurated: boolean;
}

/** Unrated is deliberately allowed until the archive review is complete. */
export const DEFAULT_CONTENT_POLICY: Readonly<ContentPolicy> = Object.freeze({
  version: 1, showMatureContent: false, strictPersonal: false,
  blockUnratedCurated: false,
});

/** Reject incomplete settings, including string booleans, before mutation. */
export function parseContentPolicy(raw: unknown): ContentPolicy {
  if (!raw || typeof raw !== 'object') {throw new Error('invalidContentPolicy');}
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || typeof value.showMatureContent !== 'boolean' ||
      typeof value.strictPersonal !== 'boolean' || typeof value.blockUnratedCurated !== 'boolean') {
    throw new Error('invalidContentPolicy');
  }
  return { version: 1, showMatureContent: value.showMatureContent,
    strictPersonal: value.strictPersonal, blockUnratedCurated: value.blockUnratedCurated };
}

/** Absence is the conservative curated context, never implicit personal. */
export function parseContentContext(raw: unknown): ContentContext {
  if (raw === undefined || raw === 'curated') {return 'curated';}
  if (raw === 'personal') {return raw;}
  throw new Error('invalidContentContext');
}

/** Apply the agreed policy matrix without treating invalid labels as unrated. */
export function allowsContent(item: DP1Item, policy: ContentPolicy, context: ContentContext): boolean {
  if (!hasValidContentLabels(item)) {return false;}
  const rating = item.contentRating;
  if (policy.showMatureContent || (context === 'personal' && !policy.strictPersonal)) {return true;}
  if (rating === 'mature') {return false;}
  return rating === 'general' || context === 'personal' || !policy.blockUnratedCurated;
}

/** Wire validation is distinct from a valid work being excluded by policy. */
export function hasValidContentLabels(item: DP1Item): boolean {
  if ('contentRating' in item && item.contentRating !== 'general' && item.contentRating !== 'mature') {return false;}
  return !('contentReasons' in item) || (Array.isArray(item.contentReasons) &&
    item.contentReasons.every(reason => typeof reason === 'string' && reason.length > 0));
}

/** A playback-only projection with its selected item's new positional index. */
export interface FilteredContent { playlist: DP1Call | null; index: number; blocked: number }

/**
 * The no-op projection: the whole playlist, nothing blocked. Used when no
 * policy is available to apply yet, so the caller holds the complete payload
 * for later reconciliation instead of a guess at what should be hidden.
 */
export function admitUnfiltered(playlist: DP1Call): FilteredContent {
  return { playlist, index: 0, blocked: 0 };
}

/**
 * Drop the signature from a playlist whose item list no longer matches the
 * signed document. A signature attests the exact bytes it was made over, so
 * carrying it onto a changed list would let `checkStatus` publish an
 * attestation for a playlist nobody signed. Every caller that rewrites `items`
 * goes through here: policy filtering and source refresh both do.
 */
export function stripPlaylistSignature<T extends DP1Call>(playlist: T): T {
  const projection: T & { signatures?: unknown } = { ...playlist };
  delete projection.signature;
  delete projection.signatures;
  return projection;
}

/**
 * Filter before loading media. Never mutate the signed source or forward its
 * signature as if it signed a smaller playlist. Keep an allowed selected item
 * selected; otherwise start with the next allowed item, wrapping only at end.
 */
export function filterContent(playlist: DP1Call, policy: ContentPolicy,
  context: ContentContext, selectedIndex = 0): FilteredContent {
  const source = playlist.items ?? [];
  const positions = source.flatMap((item, index) => allowsContent(item, policy, context) ? [index] : []);
  const blocked = source.length - positions.length;
  const index = Math.max(0, positions.findIndex(position => position >= selectedIndex));
  if (!positions.length) {return { playlist: null, index: 0, blocked };}
  if (!blocked) {return { playlist, index, blocked: 0 };}
  const projection = stripPlaylistSignature({ ...playlist,
    items: positions.map(position => source[position]) });
  return { playlist: projection, index, blocked };
}
