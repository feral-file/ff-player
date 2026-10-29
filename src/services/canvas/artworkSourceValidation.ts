import { DP1Item } from '@/models/dp1.model';
const PLAYLIST_SOURCE_PROTOCOLS = new Set(['http:', 'https:', 'data:']);
const ARTWORK_SOURCE_RESOLVE_BASE = 'https://ff-player.local/';

/**
 * Validate opaque data URLs before they become persisted playback state.
 * The URL constructor accepts arbitrary data payloads. Non-base64 data payloads
 * are intentionally left opaque: data URLs permit literal percent characters,
 * including text that is not a percent escape. Explicit base64 payloads need
 * validation because their alphabet and padding have a defined grammar.
 */
export function isValidDataUrl(url: URL): boolean {
  const separatorIndex = url.pathname.indexOf(',');
  if (separatorIndex === -1 || separatorIndex === url.pathname.length - 1) {
    return false;
  }

  const metadata = url.pathname.slice(0, separatorIndex);
  const payload = url.pathname.slice(separatorIndex + 1);
  if (!metadata.toLowerCase().endsWith(';base64')) {
    return true;
  }

  try {
    const base64Payload = decodeURIComponent(payload).replace(
      /[\t\n\f\r ]/g,
      ''
    );
    const paddingLength = /=+$/.exec(base64Payload)?.[0].length ?? 0;
    const unpaddedLength = base64Payload.length - paddingLength;
    return (
      /^[A-Za-z0-9+/]*={0,2}$/.test(base64Payload) &&
      unpaddedLength > 0 &&
      paddingLength <= 2 &&
      (paddingLength === 0
        ? unpaddedLength % 4 !== 1
        : base64Payload.length % 4 === 0)
    );
  } catch {
    return false;
  }
}

/**
 * Keeps unsupported artwork URLs out of persisted cast and schedule state.
 * Relative URLs remain valid because the browser resolves them from the player
 * origin; validation only rejects empty, malformed, and non-web schemes.
 */
export function isSupportedArtworkSource(source: string): boolean {
  try {
    const normalizedSource = source.trim();
    if (!normalizedSource) {
      return false;
    }
    const url = new URL(normalizedSource, ARTWORK_SOURCE_RESOLVE_BASE);
    return url.protocol === 'data:'
      ? isValidDataUrl(url)
      : PLAYLIST_SOURCE_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

/** Finds the first playlist item whose source is unsupported by the player. */
export function findInvalidArtworkSource(
  items: DP1Item[] | undefined
): DP1Item | undefined {
  return items?.find(item => !isSupportedArtworkSource(item.source));
}
