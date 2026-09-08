import type { DP1Defaults, DP1Item } from '@/models/dp1.model';
import type { ContentContext } from './contentPolicy';

/**
 * Device-local, bounded evidence of works that reached the viewer commit
 * boundary. This deliberately stores a castable DP-1 item beside the
 * controller-facing metadata: callers replay by opaque id through controld's
 * normal displayPlaylist route, not by trusting a phone-supplied source.
 */
export interface RecentlyPlayedRecord {
  recordId: string;
  playedAtMs: number;
  item: DP1Item;
  // Applicable playlist artist controls travel with the extracted item. The
  // replay is deliberately unsigned (the original playlist was mutated), but
  // it must retain defaults that affect the selected work.
  defaults?: DP1Defaults;
  contentContext?: ContentContext;
}

/** Bounded information exposed to a controller; it intentionally omits source. */
export interface RecentlyPlayedMetadata {
  recordId: string;
  playedAtMs: number;
  isActive: boolean;
  itemId: string;
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
}

export const RECENTLY_PLAYED_MAX_RECORDS = 50;
export const RECENTLY_PLAYED_MAX_BYTES = 512 * 1024;
export const RECENTLY_PLAYED_MAX_RECORD_BYTES = 64 * 1024;

export interface RecentlyPlayedAppendOptions {
  nowMs: number;
  nextSequence: number;
  defaults?: DP1Defaults | null;
  contentContext?: ContentContext;
}

/** Returns whether untrusted persisted JSON has the replay-minimum shape. */
function isRecord(value: unknown): value is RecentlyPlayedRecord {
  if (typeof value !== 'object' || value === null) {return false;}
  const candidate = value as {
    recordId?: unknown;
    playedAtMs?: unknown;
    item?: unknown;
  };
  if (
    typeof candidate.recordId !== 'string' ||
    !Number.isFinite(candidate.playedAtMs) ||
    typeof candidate.item !== 'object' ||
    candidate.item === null
  ) {
    return false;
  }
  const item = candidate.item as Partial<DP1Item>;
  return typeof item.id === 'string' && typeof item.source === 'string';
}

/** Validates persisted JSON before it becomes replayable device state. */
export function parseRecentlyPlayed(value: string): RecentlyPlayedRecord[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
    throw new Error('Invalid recently played history');
  }
  return parsed;
}

/** Returns the serialized UTF-8 byte count used for retained-history bounds. */
function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Adds one committed item without admitting unbounded data: DP-1 permits
 * inline manifests and data: sources, neither of which belongs in an
 * unbounded device history. `null` is an explicit unavailable outcome for
 * callers to surface, never an empty successful history.
 */
export function appendRecentlyPlayed(
  existing: RecentlyPlayedRecord[],
  item: DP1Item,
  options: RecentlyPlayedAppendOptions
): RecentlyPlayedRecord[] | null {
  const {nowMs, nextSequence, defaults, contentContext} = options;
  const record: RecentlyPlayedRecord = {
    recordId: `rp-${String(nextSequence)}`,
    playedAtMs: nowMs,
    // The JSON clone makes retained history immune to later playlist mutation.
    item: JSON.parse(JSON.stringify(item)) as DP1Item,
    ...(defaults
      ? {defaults: JSON.parse(JSON.stringify(defaults)) as DP1Defaults}
      : {}),
    ...(contentContext ? {contentContext} : {}),
  };
  if (byteLength(record) > RECENTLY_PLAYED_MAX_RECORD_BYTES) {
    return null;
  }
  const next = [record, ...existing].slice(0, RECENTLY_PLAYED_MAX_RECORDS);
  while (next.length > 0 && byteLength(next) > RECENTLY_PLAYED_MAX_BYTES) {
    next.pop();
  }
  return next;
}

/** The private device-only data used by controld to compose a normal replay. */
export interface RecentlyPlayedReplay {
  item: DP1Item;
  defaults?: DP1Defaults;
  contentContext?: ContentContext;
}

/** Finds a retained immutable item by opaque history id. */
export function recentlyPlayedItem(
  records: RecentlyPlayedRecord[],
  recordId: string
): DP1Item | null {
  const record = records.find(candidate => candidate.recordId === recordId);
  return record && isRecord(record)
    ? (JSON.parse(JSON.stringify(record.item)) as DP1Item)
    : null;
}

/** Returns a private replay snapshot for the device-only resolver. */
export function recentlyPlayedReplay(
  records: RecentlyPlayedRecord[],
  recordId: string
): RecentlyPlayedReplay | null {
  const record = records.find(candidate => candidate.recordId === recordId);
  if (!record || !isRecord(record)) {return null;}
  return JSON.parse(JSON.stringify({
    item: record.item,
    ...(record.defaults ? {defaults: record.defaults} : {}),
    ...(record.contentContext ? {contentContext: record.contentContext} : {}),
  })) as RecentlyPlayedReplay;
}

/**
 * Extract a small label snapshot without exporting an authoritative castable
 * source. The complete retained DP-1 item remains device-only for replay and
 * gives future playback policy a single re-validation seam.
 */
export function recentlyPlayedMetadata(
  records: RecentlyPlayedRecord[],
  activeRecordId: string | null
): RecentlyPlayedMetadata[] {
  return records.filter(isRecord).map(record => {
    const metadata = record.item.inlineManifest?.metadata ?? record.item.metadata;
    const thumbnails = metadata?.thumbnails;
    const thumbnailUrl =
      thumbnails?.small?.uri ??
      thumbnails?.default?.uri ??
      thumbnails?.large?.uri ??
      thumbnails?.xlarge?.uri;
    const artist = metadata?.artists
      ?.map(candidate => candidate.name)
      .filter(Boolean)
      .join(', ');
    return {
      recordId: record.recordId,
      playedAtMs: record.playedAtMs,
      isActive: record.recordId === activeRecordId,
      itemId: record.item.id,
      title: metadata?.title ?? record.item.title,
      artist: artist && artist.length > 0 ? artist : undefined,
      thumbnailUrl,
    };
  });
}
