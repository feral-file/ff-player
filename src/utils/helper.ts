import {
  FileUseAudio,
  FileUseIframePDF,
  FileUseImage,
  FileUseStreamVideo,
  FileUseVideo,
} from '@/models';
import { Scaling } from '@/models/dp1.model';

/**
 * Resolve a media URL's `Content-Type` with a cache-busting `HEAD` request so
 * playback can choose the correct renderer for extensionless assets. When the
 * browser network stack fails before a response arrives, serialize the error
 * into stable text because Chromium's remote console turns raw `Error` objects
 * into `{}` in the device log.
 */
export async function getContentTypeFromURL(
  previewURL: string
): Promise<string> {
  const base =
    typeof window === 'undefined' ? 'https://ff-player.local/' : window.location.href;
  const url = new URL(previewURL, base);
  // The second request could be failed, Chrome uses the cached response from the first request, which has no "Access-Control-Allow-Origin" response header.
  // Workaround: Use a dummy "?x-some-key=some-value" query string parameter will convince the browser that the request is different.
  // Ref: https://serverfault.com/questions/856904/chrome-s3-cloudfront-no-access-control-allow-origin-header-on-initial-xhr-req/856948#856948
  const extendPreviewURL = url.search
    ? `${previewURL}&v=${Date.now().toString()}&x-request=xhr`
    : `${previewURL}?v=${Date.now().toString()}&x-request=xhr`;

  try {
    const response = await fetch(extendPreviewURL, {
      method: 'HEAD',
    });

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

    throw new Error(`Failed to determine content type: ${String(error)}`);
  }
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
