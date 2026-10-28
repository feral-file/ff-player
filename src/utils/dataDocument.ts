/**
 * Serve `data:` artwork sources to the artwork iframe as sandboxed blob
 * documents.
 *
 * Chromium gives a document loaded from a `data:` URL an opaque origin that
 * is never a secure context, so a fully on-chain work (token metadata whose
 * `animation_url` is `data:text/html;base64,...`) loses every secure-context
 * API: `navigator.gpu` is absent and WebGPU works cannot start. The same bytes
 * served as a blob URL created by the player (origin `http://127.0.0.1:8080`,
 * a potentially trustworthy localhost origin) are a secure context.
 *
 * A blob URL inherits the player's origin, so the iframe that shows it must
 * drop `allow-same-origin`: with `allow-scripts` alone the document gets a
 * fresh opaque origin that cannot reach the player's DOM, storage or
 * IndexedDB, which is the isolation a `data:` document already had. Storage
 * stays unavailable to these works, as it is in any `data:` or sandboxed
 * embedding; works must guard their own storage reads.
 *
 * Blob URLs are cached by source so both slots and re-renders share one, and
 * revoked through `releaseDataDocumentURLs` once no slot shows the source.
 */

const SANDBOX_ISOLATED = 'allow-scripts';
const SANDBOX_DEFAULT = 'allow-same-origin allow-scripts';

const blobURLBySource = new Map<string, string>();
const dataDocumentBlobURLs = new Set<string>();

/**
 * Percent-decode a string to bytes the way the Fetch `data:` URL processor
 * does: valid `%XX` escapes become bytes, every other character stays as its
 * UTF-8 bytes, including a literal `%` that starts no escape.
 */
function percentDecode(text: string): Uint8Array<ArrayBuffer> {
  const input = new TextEncoder().encode(text);
  const out = new Uint8Array(input.length);
  const isHex = (b: number | undefined) =>
    b !== undefined && /[0-9a-fA-F]/.test(String.fromCharCode(b));
  let length = 0;
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === 0x25 && isHex(input[i + 1]) && isHex(input[i + 2])) {
      out[length] = parseInt(
        String.fromCharCode(input[i + 1], input[i + 2]),
        16
      );
      i += 2;
    } else {
      out[length] = input[i];
    }
    length += 1;
  }
  return out.slice(0, length);
}

/**
 * Decode a `data:` URL into a Blob carrying its declared media type, or
 * return null when it is not a well-formed `data:` URL.
 */
export function blobFromDataURL(source: string): Blob | null {
  const trimmed = source.trim();
  const comma = trimmed.indexOf(',');
  if (!/^data:/i.test(trimmed) || comma === -1) {
    return null;
  }
  const metadata = trimmed.slice('data:'.length, comma);
  const isBase64 = /;\s*base64\s*$/i.test(metadata);
  const mediaType = metadata.replace(/;\s*base64\s*$/i, '').trim();
  const body = percentDecode(trimmed.slice(comma + 1));
  let bytes = body;
  if (isBase64) {
    try {
      // atob is the forgiving-base64 decode the Fetch spec uses here. Valid
      // base64 is ASCII, so a UTF-8 decode of the body is exact for it, and
      // any other byte becomes U+FFFD, which atob rejects.
      const binary = atob(new TextDecoder().decode(body));
      bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    } catch {
      return null;
    }
  }
  return new Blob([bytes], {
    type: mediaType || 'text/plain;charset=US-ASCII',
  });
}

/**
 * Return the iframe URL for an artwork source: a cached blob URL for a
 * `data:` source, or the source unchanged for anything else (including a
 * `data:` URL that does not decode, which keeps today's behavior).
 */
export function dataDocumentURL(source: string): string {
  const cached = blobURLBySource.get(source);
  if (cached) {
    return cached;
  }
  const blob = blobFromDataURL(source);
  if (!blob) {
    return source;
  }
  const url = URL.createObjectURL(blob);
  blobURLBySource.set(source, url);
  dataDocumentBlobURLs.add(url);
  return url;
}

/**
 * The `sandbox` attribute for the artwork iframe showing `src`. Blob
 * documents made by `dataDocumentURL` must not get `allow-same-origin`, or
 * the work would run as the player's own origin.
 */
export function artworkIframeSandbox(src: string): string {
  return dataDocumentBlobURLs.has(src) ? SANDBOX_ISOLATED : SANDBOX_DEFAULT;
}

/**
 * Revoke the blob URL of every `data:` source not in `inUse`. Call with the
 * sources the slots currently show; an empty list releases them all.
 */
export function releaseDataDocumentURLs(inUse: Iterable<string>): void {
  const keep = new Set(inUse);
  // Deleting the visited entry during Map#forEach is safe.
  blobURLBySource.forEach((url, source) => {
    if (!keep.has(source)) {
      URL.revokeObjectURL(url);
      blobURLBySource.delete(source);
      dataDocumentBlobURLs.delete(url);
    }
  });
}
