import {
  FileUseAudio,
  FileUseIframePDF,
  FileUseImage,
  FileUseStreamVideo,
  FileUseVideo,
} from '@/models';
import { Scaling } from '@/models/dp1.model';
import { waitForDaemonConnectivity } from '@/services/DaemonConnectivity';
import { isCid } from '@/utils/cid';

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
 * Upper bound on the content-type HEAD probe itself. Without this, a gateway
 * that accepts the TCP connection but never responds (observed repeatedly
 * against a third-party IPFS gateway in feral-file/ff-player#307's support
 * bundle) leaves `fetch` pending forever: the promise never settles, so
 * nothing downstream — not the M7 refresh budget, not the render-failure
 * modal — ever sees a failure to retry or skip. Aborting at this bound turns
 * that hang into an ordinary fetch rejection, which the existing catch below
 * already classifies like any other network failure.
 */
export const CONTENT_TYPE_HEAD_TIMEOUT_MS = 10_000;

/**
 * Fallback IPFS gateways probed, in this order, after a content-addressed
 * source's own host fails. Matches ff-app's `ipfsMediaCandidates()` exactly
 * (feral-file/feral-file#3583) — Feral File's own gateway only serves CIDs it
 * pinned (fast 404 otherwise), Filebase mirrors the wider network — so the
 * same CID resolves identically across every Feral File client instead of
 * each one picking its own list.
 */
const IPFS_FALLBACK_GATEWAY_HOSTS = [
  'https://ipfs.feralfile.com',
  'https://ipfs.filebase.io',
];

/**
 * Query parameters that may legitimately affect WHAT a generative artwork
 * renders (iteration/seed inputs), as opposed to host-scoped credentials
 * (a gateway auth token, a signed-URL parameter) that the original host
 * issued and a fallback host never did. Matches ff-app's
 * `_artworkQueryKeys` exactly (feral-file/feral-file#3583) — a gateway token
 * copied onto `ipfs.feralfile.com`/`ipfs.filebase.io` would both leak the
 * credential to an unrelated operator and fail there anyway, since neither
 * fallback host recognizes it.
 */
const IPFS_FALLBACK_QUERY_KEYS = new Set([
  'fxhash',
  'fxiteration',
  'fxminter',
  'seed',
]);

/**
 * Keep only the artwork-identity query parameters from a source's query
 * string, dropping everything else (gateway tokens, signed-URL parameters)
 * before it is replayed against a fallback host. Returns `''` (no `?`) when
 * nothing survives the filter.
 */
function filterFallbackQuery(search: string): string {
  if (!search) {
    return '';
  }
  const kept = search
    .slice(1)
    .split('&')
    .filter(pair => {
      const key = pair.split('=')[0] ?? '';
      try {
        return IPFS_FALLBACK_QUERY_KEYS.has(decodeURIComponent(key));
      } catch {
        // A malformed escape in the key is never one of the allowed names.
        return false;
      }
    });
  return kept.length > 0 ? `?${kept.join('&')}` : '';
}

/**
 * Build the ordered list of URLs to probe for a media source: the original
 * URL first (so a healthy host never pays for a fallback), then — only when
 * `isContentAddressed` recognizes an `/ipfs/<cid>` path — the same fallback
 * gateways every Feral File client tries, carrying over the path (CID, any
 * sub-path), the artwork-identity query parameters (`filterFallbackQuery`),
 * and the fragment onto each fallback host. Host-scoped query parameters
 * (gateway tokens, signed-URL parameters) are dropped rather than leaked to
 * an unrelated operator. A source with no such path has no substitute host,
 * so it keeps the single-candidate behavior this function always had.
 */
function ipfsGatewayCandidates(previewURL: string, url: URL): string[] {
  const ipfsPathMatch = /\/ipfs\/.+/.exec(url.pathname);
  if (!ipfsPathMatch || !isContentAddressed(previewURL)) {
    return [previewURL];
  }
  const suffix = `${ipfsPathMatch[0]}${filterFallbackQuery(url.search)}${url.hash}`;
  const candidates = [
    previewURL,
    ...IPFS_FALLBACK_GATEWAY_HOSTS.map(host => `${host}${suffix}`),
  ];
  return Array.from(new Set(candidates));
}

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
    public readonly isNetworkFailure: boolean,
    /**
     * True when the source was content-addressed and every fallback gateway
     * candidate (see `ipfsGatewayCandidates`) was tried and failed — not just
     * the original, possibly-dead host. A caller that would otherwise try the
     * failed URL as a renderable iframe (the non-network-failure branch)
     * should not do that here: every URL that could have served this CID
     * already failed, so retrying one of them as an iframe only reproduces
     * the same broken load.
     */
    public readonly exhaustedGatewayCandidates = false
  ) {
    super(message);
    this.name = 'ContentTypeDetectionError';
  }
}

/**
 * Thrown by `probeCandidateContentType` for every failure, carrying the
 * original error (exactly what a single-candidate `catch` would have seen,
 * for identical logging and message text) plus two signals the outer loop
 * in `getContentTypeFromURL` has no other way to recover once control
 * crosses the `catch` — `probeCandidateContentType` runs in its own scope
 * per candidate:
 * - `reachedServer`: `fetch` resolved a response at all, including a
 * non-ok one.
 * - `okButUntyped`: that response was itself 2xx, just missing a usable
 * `Content-Type` header — the resource IS there, unlike a 4xx/5xx
 * candidate that answered but doesn't have this CID. Only a candidate
 * this is true for is safe to render from if extension inference later
 * supplies the type a 404'd candidate never would have been.
 */
class CandidateProbeError extends Error {
  constructor(
    public readonly originalError: unknown,
    public readonly reachedServer: boolean,
    public readonly okButUntyped: boolean
  ) {
    super(String(originalError));
  }
}

/** One candidate URL's `HEAD` probe: its reported MIME type, or a `CandidateProbeError` on any failure. */
async function probeCandidateContentType(candidateURL: URL): Promise<string> {
  // The second request could be failed, Chrome uses the cached response from the first request, which has no "Access-Control-Allow-Origin" response header.
  // Workaround: Use a dummy "?x-some-key=some-value" query string parameter will convince the browser that the request is different.
  // Ref: https://serverfault.com/questions/856904/chrome-s3-cloudfront-no-access-control-allow-origin-header-on-initial-xhr-req/856948#856948
  //
  // Built via `URLSearchParams` rather than string concatenation onto
  // `candidateURL.toString()`: a fragment (an HTML artwork's seed/viewing
  // state, see `ipfsGatewayCandidates`) always serializes LAST, so
  // appending text after that string lands inside the fragment — which a
  // browser strips before the request ever reaches the network — and the
  // cache-busting params this workaround depends on would never actually
  // vary the request (run-reviewer, PR #328 inner loop: this round's own
  // fragment fix newly carries a fragment onto fallback candidates too).
  const extendedCandidateURL = new URL(candidateURL.href);
  extendedCandidateURL.searchParams.set('v', Date.now().toString());
  extendedCandidateURL.searchParams.set('x-request', 'xhr');
  const extendCandidateURL = extendedCandidateURL.toString();

  // Flips true the moment `fetch` resolves with ANY response — even a
  // non-ok one. `fetch` only REJECTS for a network-level failure (offline,
  // DNS, connection refused); every throw below this point happens with a
  // response already in hand, so `reachedServer` is exactly the network-vs-
  // reachable distinction ContentTypeDetectionError exposes.
  let reachedServer = false;
  let okButUntyped = false;
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => { abortController.abort(); },
    CONTENT_TYPE_HEAD_TIMEOUT_MS
  );
  try {
    const response = await fetch(extendCandidateURL, {
      method: 'HEAD',
      signal: abortController.signal,
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
      return inferContentTypeFromURL(candidateURL, contentType) ?? contentType;
    }
    okButUntyped = true;
    throw new Error('No content type found in headers');
  } catch (error) {
    throw new CandidateProbeError(error, reachedServer, okButUntyped);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Resolve a media URL's `Content-Type` so playback can choose the correct
 * renderer for extensionless assets, and report which URL actually answered
 * so the caller can render from that same URL instead of the one that may
 * have failed. Declared `data:` MIME types are returned directly; other
 * sources use a cache-busting `HEAD` request against each candidate from
 * `ipfsGatewayCandidates` in turn (the original host first), each bounded by
 * its own `CONTENT_TYPE_HEAD_TIMEOUT_MS` so one dead gateway cannot eat the
 * budget later candidates need. When the browser network stack fails before
 * a response arrives, serialize the error into stable text because
 * Chromium's remote console turns raw `Error` objects into `{}` in the
 * device log.
 */
export async function getContentTypeFromURL(
  previewURL: string
): Promise<{ contentType: string; resolvedURL: string }> {
  const url = resolveArtworkSourceURL(previewURL);
  if (url.protocol === 'data:') {
    return { contentType: contentTypeFromDataURL(url), resolvedURL: previewURL };
  }

  const candidates = ipfsGatewayCandidates(previewURL, url);
  let reachedServer = false;
  let lastError: unknown;
  // The last candidate that answered 2xx without a usable `Content-Type`:
  // the resource IS there, so extension inference below should render from
  // THIS URL rather than `previewURL` — which may be the dead original host
  // a 404'd fallback (not this) never actually proved reachable.
  let lastRenderableCandidate: string | undefined;

  for (const candidate of candidates) {
    const candidateURL =
      candidate === previewURL ? url : resolveArtworkSourceURL(candidate);
    try {
      const contentType = await probeCandidateContentType(candidateURL);
      return { contentType, resolvedURL: candidate };
    } catch (error) {
      const probeError =
        error instanceof CandidateProbeError ? error : undefined;
      lastError = probeError ? probeError.originalError : error;
      if (probeError?.reachedServer) {
        reachedServer = true;
      }
      if (probeError?.okButUntyped) {
        lastRenderableCandidate = candidate;
      }
      console.log(
        '[ContentType] Failed to get content-type from HEAD request',
        serializeErrorForLog(lastError)
      );
    }
  }

  // A single-candidate source (not content-addressed) keeps its original,
  // optimistic behavior: guess from the extension and let the renderer try
  // `previewURL` — the only URL that was ever in play. For a multi-candidate
  // walk, every fallback gateway was tried too; guessing a type is harmless,
  // but defaulting to `previewURL` would point the renderer at a host
  // already proven dead or 404 — exactly this fix's bug — unless at least
  // one candidate (`lastRenderableCandidate`) actually proved itself live.
  // With no such candidate, fall through to the exhausted-candidates failure
  // below instead of reporting a false success.
  const inferredType = inferContentTypeFromURL(url);
  if (inferredType && (candidates.length === 1 || lastRenderableCandidate)) {
    console.log('[ContentType] Inferred Content-Type:', inferredType);
    return {
      contentType: inferredType,
      resolvedURL: lastRenderableCandidate ?? previewURL,
    };
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
    `Failed to determine content type: ${String(lastError)}`,
    !reachedServer && offlineCorroborated,
    candidates.length > 1
  );
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

    // Match /ipfs/<CID>: every multibase alphabet `isCid` accepts (CIDv0's
    // base58, CIDv1's base16/base32/base36) is alphanumeric, so this stops
    // at the CID's own end exactly where the old length check did — a `/`
    // subpath, a `.` extension glued directly on, a `?query`, or a
    // `#fragment` are all left out of the capture rather than failing
    // `isCid` outright (feralfile-bot review, PR #328 F1: run-reviewer).
    const ipfsMatch = /\/ipfs\/([a-zA-Z0-9]+)/.exec(url.pathname);
    return !!ipfsMatch && isCid(ipfsMatch[1]);
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
