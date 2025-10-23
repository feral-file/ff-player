import {
  FileUseAudio,
  FileUseIframePDF,
  FileUseImage,
  FileUseStreamVideo,
  FileUseVideo,
} from '@/models';
import { Scaling } from '@/models/dp1.model';

export async function getContentTypeFromURL(
  previewURL: string
): Promise<string> {
  const url = new URL(previewURL);
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
    const contentType = response.headers.get('Content-Type');
    if (contentType) {
      return contentType;
    }
    throw new Error('No content type found in headers');
  } catch (error) {
    console.log(
      '[ContentType] Failed to get content-type from HEAD request',
      JSON.stringify(error)
    );

    const extension = url.pathname.split('.').pop()?.toLowerCase();
    if (extension) {
      let inferredType = '';
      if (FileUseImage.includes(extension)) {
        inferredType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
      } else if (FileUseVideo.includes(extension)) {
        inferredType = `video/${extension}`;
      } else if (FileUseAudio.includes(extension)) {
        inferredType = `audio/${extension}`;
      } else if (FileUseIframePDF.includes(extension)) {
        inferredType = 'application/pdf';
      } else if (FileUseStreamVideo.includes(extension)) {
        inferredType = 'application/x-mpegurl';
      }

      if (inferredType) {
        console.log('[ContentType] Inferred Content-Type:', inferredType);
        return inferredType;
      }
    }

    throw new Error(`Failed to determine content type: ${String(error)}`);
  }
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;

  // Array compare (thứ tự quan trọng)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Object compare
  if (a && b && typeof a === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const keysA = Object.keys(a);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

// ---- Fetch content of item.ref ----
export async function sha256hex(
  bytes: Uint8Array<ArrayBuffer>
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bufToHex(a: Uint8Array) {
  return Array.from(a)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Accept hex or base64/base64url; normalize to lowercase hex
export function normalizeHashToHex(s: string): string {
  const str = s.trim();
  // Allow prefixes like "sha256:..." or "sha256:hex:..."
  const clean = str.replace(/^sha256:(hex:)?/i, '');
  if (/^[0-9a-fA-F]+$/.test(clean) && clean.length >= 64)
    return clean.toLowerCase();
  // Base64/base64url → hex
  const b = base64AnyToBytes(clean);
  return bufToHex(b);
}

function base64AnyToBytes(inp: string): Uint8Array {
  // Normalize base64url to base64
  const b64 = inp
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/=+$/, m => m);
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function isContentAddressed(u: string): boolean {
  // Check if it is an IPFS URI scheme (e.g., ipfs://...)
  if (typeof u !== 'string') return false;
  if (u.startsWith('ipfs://')) return true;

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
