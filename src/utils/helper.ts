import {
  FileUseAudio,
  FileUseIframePDF,
  FileUseImage,
  FileUseStreamVideo,
  FileUseVideo,
} from '@/models';
import { Scaling } from '@/models/dp1.model';
import { waitForDaemonConnectivity } from '@/services/DaemonConnectivity';

/**
 * Upper bound on waiting for the daemon's FIRST connectivity verdict before
 * classifying a no-response HEAD failure as network-or-not. The daemon's
 * generation-ready replay lands within ~1s of the page installing its CDP
 * handlers, so a device with a healthy daemon resolves this wait early in
 * either direction. The full bound is paid whenever no verdict ever arrives
 * — a standalone browser, a daemon that is down, or a controld predating
 * the generation-ready replay — and then on EVERY such classification
 * (extensionless source, HEAD got no response, `navigator.onLine` still
 * true), which is why the constant must stay small.
 */
export const DAEMON_VERDICT_WAIT_MS = 3_000;

/**
 * Read the declared media type from a `data:` URL without probing the network.
 * Cache-busting query suffixes are part of the payload for data URLs, so a
 * `HEAD` probe would corrupt the bytes and fail MIME detection.
 */
function contentTypeFromDataURL(url: URL): string {
  const separatorIndex = url.pathname.indexOf(',');
  const metadata =
    separatorIndex === -1 ? url.pathname : url.pathname.slice(0, separatorIndex);
  const mediaType = metadata.split(';')[0]?.trim();
  // RFC 2397 defaults an omitted media type to text/plain.
  return mediaType && mediaType.length > 0 ? mediaType : 'text/plain';
}

/**
 * Thrown by `getContentTypeFromURL` when detection ultimately fails
 * (extension inference also came up empty). Carries `isNetworkFailure`: true
 * only when BOTH `fetch` never got a response at all (offline, DNS failure,
 * connection refused — the request never reached a server) AND an offline
 * corroboration signal agrees: `navigator.onLine` false, OR the daemon's
 * pushed connectivity verdict is offline (awaited briefly when not yet known
 * — see the classification site). False otherwise — including a response
 * that DID come back but was unhelpful (4xx/5xx, or 2xx with no
 * `Content-Type` header), and a `fetch` rejection nothing corroborates (the
 * common CORS/CSP case: a reachable, unrelated-to-connectivity host that
 * rejects with the same bare error a real network failure would). Either way
 * the server is effectively reachable from the player's perspective, and the
 * type is simply unknown.
 * Callers that need to tell "offline" apart from "reachable but untyped"
 * (ArtworkPlayer's fallback-iframe path, for the offline degraded signal)
 * read this instead of parsing the message string.
 */
export class ContentTypeDetectionError extends Error {
  constructor(
    message: string,
    public readonly isNetworkFailure: boolean
  ) {
    super(message);
    this.name = 'ContentTypeDetectionError';
  }
}

/**
 * Resolve a media URL's `Content-Type` so playback can choose the correct
 * renderer for extensionless assets. Declared `data:` MIME types are returned
 * directly; other sources use a cache-busting `HEAD` request. When the browser
 * network stack fails before a response arrives, serialize the error into
 * stable text because Chromium's remote console turns raw `Error` objects into
 * `{}` in the device log.
 */
export async function getContentTypeFromURL(
  previewURL: string
): Promise<string> {
  const url = resolveArtworkSourceURL(previewURL);
  if (url.protocol === 'data:') {
    return contentTypeFromDataURL(url);
  }

  // The second request could be failed, Chrome uses the cached response from the first request, which has no "Access-Control-Allow-Origin" response header.
  // Workaround: Use a dummy "?x-some-key=some-value" query string parameter will convince the browser that the request is different.
  // Ref: https://serverfault.com/questions/856904/chrome-s3-cloudfront-no-access-control-allow-origin-header-on-initial-xhr-req/856948#856948
  const resolvedPreviewURL = url.toString();
  const extendPreviewURL = url.search
    ? `${resolvedPreviewURL}&v=${Date.now().toString()}&x-request=xhr`
    : `${resolvedPreviewURL}?v=${Date.now().toString()}&x-request=xhr`;

  // Flips true the moment `fetch` resolves with ANY response — even a
  // non-ok one. `fetch` only REJECTS for a network-level failure (offline,
  // DNS, connection refused); every throw below this point happens with a
  // response already in hand, so `reachedServer` is exactly the network-vs-
  // reachable distinction ContentTypeDetectionError exposes.
  let reachedServer = false;
  try {
    const response = await fetch(extendPreviewURL, {
      method: 'HEAD',
    });
    reachedServer = true;

    // Treat non-2xx as failure, even if Content-Type is present (e.g., 504 text/plain pages)
    if (!response.ok) {
      throw new Error(
        `HEAD request failed with status ${String(
          response.status
        )} ${response.statusText}`
      );
    }

    const contentType = response.headers.get('Content-Type');
    if (contentType) {
      return inferContentTypeFromURL(url, contentType) ?? contentType;
    }
    throw new Error('No content type found in headers');
  } catch (error) {
    console.log(
      '[ContentType] Failed to get content-type from HEAD request',
      serializeErrorForLog(error)
    );

    const inferredType = inferContentTypeFromURL(url);
    if (inferredType) {
      console.log('[ContentType] Inferred Content-Type:', inferredType);
      return inferredType;
    }

    // `!reachedServer` alone is not enough: `fetch` rejects with the same
    // bare TypeError for a genuine network failure AND for a CORS/CSP/
    // extension block — a third-party host that is perfectly reachable but
    // omits Access-Control-Allow-Origin on this exact cache-busted HEAD (see
    // the comment above) rejects identically to an offline device. Without
    // corroboration, an ONLINE device hitting that CORS wall would get
    // `isNetworkFailure: true` and raise the degraded flag with nothing
    // left to ever clear it — a healthy artwork stuck degraded forever.
    //
    // Two independent corroborating signals, either suffices:
    //  - `navigator.onLine` false: the browser's own interface is down.
    //    Necessary but NOT sufficient coverage on its own — the device's
    //    setup AP keeps the interface up, so an offline frame in AP mode
    //    reads `onLine: true` (the 2026-08-05 blank-wall incident: this
    //    classification silently fell through to the fallback iframe, whose
    //    cross-origin `load` masks failure, and the offline backdrop never
    //    rose).
    //  - The daemon's pushed connectivity verdict says offline. It is the
    //    authoritative WAN probe and covers AP mode and link-without-internet.
    //    Its first push races this very classification (it arrived 7ms too
    //    late in the incident), so when no verdict is known yet we WAIT for
    //    one, bounded by DAEMON_VERDICT_WAIT_MS. The wait only engages on
    //    the already-failed no-response path with `onLine` still true: a
    //    HEAD that reaches the server never pays it, and an online cold
    //    boot's CORS-blocked HEAD pays at most the time to the first replay
    //    (the full bound only when no daemon ever answers — see the
    //    constant's doc). Timeout resolves to `null` = uncorroborated,
    //    preserving the CORS-safe default.
    //    Known limitation, accepted: the verdict proves "no WAN", not "this
    //    host is unreachable" — a LAN-reachable, CORS-blocked host on a
    //    LAN-without-WAN device now classifies as a network failure (no
    //    fallback iframe; backdrop instead of a possibly-renderable LAN
    //    artwork). Fielded artwork sources are WAN-hosted; the recorded
    //    alternative in DEVICE_LOCAL_PLAYER.md removes this if it ever
    //    bites.
    const browserOffline =
      typeof navigator !== 'undefined' && !navigator.onLine;
    let offlineCorroborated = browserOffline;
    if (!reachedServer && !offlineCorroborated) {
      offlineCorroborated =
        (await waitForDaemonConnectivity(DAEMON_VERDICT_WAIT_MS)) === false;
    }
    throw new ContentTypeDetectionError(
      `Failed to determine content type: ${String(error)}`,
      !reachedServer && offlineCorroborated
    );
  }
}

/**
 * Resolve a validated artwork source against the browser origin before a
 * renderer needs URL semantics. DP1 allows relative and protocol-relative
 * sources for device-local playback, while stored/cast payloads must retain
 * their original source strings for compatibility.
 */
export function resolveArtworkSourceURL(source: string): URL {
  const base =
    typeof window === 'undefined'
      ? 'http://localhost'
      : window.location.origin;
  return new URL(source, base);
}

/**
 * Infer known media types from file extensions when server metadata is absent
 * or too generic to select a renderer safely.
 */
function inferContentTypeFromURL(
  url: URL,
  reportedContentType?: string
): string | null {
  if (
    reportedContentType &&
    !isGenericBinaryContentType(reportedContentType)
  ) {
    return null;
  }

  const extension = url.pathname.split('.').pop()?.toLowerCase();
  if (!extension) {
    return null;
  }

  if (FileUseImage.includes(extension)) {
    return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  }
  if (FileUseVideo.includes(extension)) {
    return `video/${extension}`;
  }
  if (FileUseAudio.includes(extension)) {
    return `audio/${extension}`;
  }
  if (FileUseIframePDF.includes(extension)) {
    return 'application/pdf';
  }
  if (FileUseStreamVideo.includes(extension)) {
    return 'application/x-mpegurl';
  }
  if (extension === 'glb') {
    return 'model/gltf-binary';
  }
  if (extension === 'gltf') {
    return 'model/gltf+json';
  }

  return null;
}

/**
 * Identify binary fallback types that should not override clearer file
 * extension evidence such as `.glb` or `.gltf`.
 */
function isGenericBinaryContentType(contentType: string): boolean {
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  return (
    mediaType === 'application/octet-stream' ||
    mediaType === 'binary/octet-stream'
  );
}

/**
 * Flatten unknown failures into stable log text for browser console capture.
 */
function serializeErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: serializeErrorCause(error.cause),
    });
  }

  if (typeof error === 'string') {
    return error;
  }

  return JSON.stringify({
    value: describeUnknownValue(error),
    raw: error,
  });
}

/**
 * Serialize nested causes without relying on default object stringification.
 */
function serializeErrorCause(cause: unknown): string | Record<string, unknown> | null {
  if (cause === undefined) {
    return null;
  }

  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };
  }

  return typeof cause === 'string'
    ? cause
    : {
        value: describeUnknownValue(cause),
      };
}

/**
 * Produce a readable label for non-Error values that appear in caught failures.
 */
function describeUnknownValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'object') {
    return Object.prototype.toString.call(value);
  }

  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return value.toString();
    case 'symbol':
      return value.description ? `Symbol(${value.description})` : 'Symbol()';
    case 'function':
      return `[function ${value.name || 'anonymous'}]`;
    default:
      return 'unknown';
  }
}

/**
 * Map the player scaling preference onto CSS `object-fit`.
 */
export function convertScalingToObjectFit(
  scalingMode?: Scaling
): 'contain' | 'cover' | 'fill' {
  switch (scalingMode) {
    case Scaling.Fit:
      return 'contain';
    case Scaling.Fill:
      return 'cover';
    case Scaling.Stretch:
      return 'fill';
    default:
      return 'contain'; // Default to 'contain' for undefined or other values
  }
}

/**
 * Convert DP1 margin values into the CSS shape expected by the player shell.
 */
export function getDP1Margin(margin: number | string): string {
  if (typeof margin === 'number') {
    return `${String(margin)}px`;
  }

  if (margin.endsWith('%')) {
    const marginValue = Number(margin.replace('%', ''));
    return `${String(marginValue)}vh ${String(marginValue)}vw`;
  }

  return margin;
}

/**
 * Compare nested arrays and objects deeply for the small plain-data payloads
 * used in playback configuration.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }

  // Array compare (thứ tự quan trọng)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // Object compare
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      return false;
    }
    for (const key of keysA) {
      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

// ---- TODO: Implement ref hash verification on DP1Service.getItemRef ----
/**
 * Hash an in-memory byte buffer into lowercase SHA-256 hex.
 */
export async function sha256hex(
  bytes: Uint8Array<ArrayBuffer>
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert bytes into lowercase hexadecimal text.
 */
function bufToHex(a: Uint8Array) {
  return Array.from(a)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Accept hex or base64/base64url; normalize to lowercase hex
/**
 * Normalize either hex or base64/base64url SHA-256 values into lowercase hex.
 */
export function normalizeHashToHex(s: string): string {
  const str = s.trim();
  // Allow prefixes like "sha256:..." or "sha256:hex:..."
  const clean = str.replace(/^sha256:(hex:)?/i, '');
  if (/^[0-9a-fA-F]+$/.test(clean) && clean.length >= 64) {
    return clean.toLowerCase();
  }
  // Base64/base64url → hex
  const b = base64AnyToBytes(clean);
  return bufToHex(b);
}

/**
 * Decode base64 or base64url text into bytes across browser and Node runtimes.
 */
function base64AnyToBytes(inp: string): Uint8Array {
  // Normalize base64url to base64
  const b64 = inp
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=+$/, m => m);
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }

  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Narrow unknown values to plain key/value objects for recursive comparison.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Recognize content-addressed IPFS-style URIs and gateway paths.
 */
export function isContentAddressed(u: string): boolean {
  // Check if it is an IPFS URI scheme (e.g., ipfs://...)
  if (typeof u !== 'string') {
    return false;
  }
  if (u.startsWith('ipfs://')) {
    return true;
  }

  try {
    const url = new URL(u);

    // Match /ipfs/<CID> (CID is case-insensitive, usually base58 or base32)
    // CIDv0: Qm... (base58), CIDv1: base32 lowercase, 46+ chars
    // Accepts /ipfs/<cid>(/...)
    const ipfsMatch = /\/ipfs\/([a-zA-Z0-9]+)/.exec(url.pathname);
    if (ipfsMatch && ipfsMatch[1].length >= 46) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Append ff-player's UI-local `display_mode` rendering hint to an artwork
 * URL, preserving the source's original query delimiter exactly.
 *
 * This append must be losslessly reversible. The offline-cache replay in
 * `controld` strips `display_mode` back off and matches the remainder against
 * the captured resource key by exact string, and the capture stores the
 * *bare* `item.Source`, so any byte this adds or drops beyond the hint itself
 * turns a fully cached artwork into Chromium's error page. Source, appended
 * form, and what the strip must return:
 *
 * - `https://host/a` / `https://host/a?display_mode=fit` / `https://host/a`
 * - `https://host/a?` / `https://host/a?&display_mode=fit` / `https://host/a?`
 * - `https://host/a?b=1` / `https://host/a?b=1&display_mode=fit` / `https://host/a?b=1`.
 *
 * The delimiter is read from the serialized href rather than from `search`,
 * because `search` is `''` for BOTH a query-less URL and one carrying an
 * explicit empty query — collapsing the first two rows above into the same
 * output and breaking one of them whichever way it resolves. The fragment is
 * excluded from that test since it may legitimately contain a `?`.
 *
 * The whole search string is assigned rather than going through
 * `URLSearchParams`: that setter re-serializes every existing parameter, and
 * the resulting reorder/re-encode would break the same exact-match lookup.
 *
 * Callers must exclude `data:` sources — their query-like text is content,
 * not parameters.
 */
export function appendDisplayModeParam(url: URL, displayMode: string): string {
  const next = new URL(url.href);
  const fragmentStart = next.href.indexOf('#');
  const beforeFragment =
    fragmentStart === -1 ? next.href : next.href.slice(0, fragmentStart);
  const hint = `display_mode=${displayMode}`;
  next.search = beforeFragment.includes('?') ? `${next.search}&${hint}` : hint;
  return next.toString();
}
