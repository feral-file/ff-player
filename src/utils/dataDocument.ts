/**
 * Give every `data:` artwork its own device-local origin.
 *
 * Chromium gives a document loaded from a `data:` URL an opaque origin that is
 * never a secure context and has no storage. A fully on-chain work (token
 * metadata whose `animation_url` is `data:text/html;base64,...`) therefore
 * loses WebGPU and dies on its first `localStorage`, `sessionStorage`,
 * IndexedDB or cookie access, showing only its background.
 *
 * On an FF1 the player runs at `http://127.0.0.1:8080`, served by a static
 * server that answers any hostname, and Chromium resolves every `*.localhost`
 * name to loopback and treats it as a secure context. So the player loads a
 * `data:` work in `http://<label>.localhost:<port>/data-document.html`, where
 * `<label>` is the first 128 bits of the SHA-256 of the `data:` URL (fragment
 * excluded), carrying that URL in the page's fragment. The shell
 * (`public/data-document.html`) re-derives the label from what it was given,
 * refuses anything that does not match its own hostname, and replaces itself
 * with the decoded bytes as a document of its origin.
 *
 * The result: each work runs in an origin of its own, with persistent storage
 * and a secure context; it is cross-origin to the player and to every other
 * work, so the iframe keeps the default `allow-same-origin allow-scripts`
 * sandbox. Because the origin is content-addressed and the shell checks it, no
 * other page can run different bytes in a work's origin to reach its storage.
 *
 * Off loopback (the player deployed as a website), `*.localhost` would point at
 * the viewer's own machine, so `data:` sources there keep loading directly.
 */

export const DATA_DOCUMENT_SHELL_PATH = '/data-document.html';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

// data: URL without fragment -> label ('' when hashing failed).
const labelBySource = new Map<string, string>();
const pendingSources = new Set<string>();

/**
 * Split a URL at its first `#`. A fragment is never part of a `data:` body
 * (Fetch's data: URL processor excludes it); the shell keeps it on the
 * work's own URL, where the work reads it as `location.hash`.
 */
export function splitFragment(url: string): [string, string] {
  const hash = url.indexOf('#');
  return hash === -1 ? [url, ''] : [url.slice(0, hash), url.slice(hash)];
}

/**
 * Hex of the first 16 bytes of SHA-256 over `body`: a 32-character DNS label.
 * The shell computes the same value; keep the two in step.
 */
export async function dataDocumentLabel(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body)
  );
  return Array.from(new Uint8Array(digest).slice(0, 16), b =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

/** The player's own location when it runs on loopback, otherwise null. */
function loopbackPlayerLocation(): Location | null {
  const location = globalThis.location as Location | undefined;
  return location && LOOPBACK_HOSTS.has(location.hostname) ? location : null;
}

/** Whether `source` is a `data:` URL that plays through a device-local origin. */
export function usesDataDocument(source: string): boolean {
  return /^data:/i.test(source.trim()) && loopbackPlayerLocation() !== null;
}

/**
 * The iframe URL for a `data:` artwork source: the shell on the work's own
 * `<label>.localhost` origin, carrying the source in its fragment. Returns
 * null while the label is still being hashed and calls `onReady` once it is;
 * returns `source` unchanged for anything that does not use a data document
 * (web sources, or any source off loopback) and when hashing failed.
 */
export function dataDocumentURL(
  source: string,
  onReady: () => void
): string | null {
  const location = loopbackPlayerLocation();
  const trimmed = source.trim();
  if (!location || !/^data:/i.test(trimmed)) {
    return source;
  }
  const [body] = splitFragment(trimmed);
  const label = labelBySource.get(body);
  if (label === '') {
    return source;
  }
  if (label) {
    const port = location.port ? `:${location.port}` : '';
    return `${location.protocol}//${label}.localhost${port}${DATA_DOCUMENT_SHELL_PATH}#${encodeURIComponent(trimmed)}`;
  }
  if (!pendingSources.has(body)) {
    pendingSources.add(body);
    void dataDocumentLabel(body)
      .catch(() => '')
      .then(computed => {
        labelBySource.set(body, computed);
        pendingSources.delete(body);
        onReady();
      });
  }
  return null;
}

/**
 * Drop cached labels for every `data:` source not in `inUse`. The cache keys
 * are whole `data:` URLs, often hundreds of kilobytes, so they must not
 * outlive the slots that show them. An empty list forgets them all.
 */
export function forgetDataDocuments(inUse: Iterable<string>): void {
  const keep = new Set(
    Array.from(inUse, source => splitFragment(source.trim())[0])
  );
  labelBySource.forEach((_label, body) => {
    if (!keep.has(body)) {
      labelBySource.delete(body);
    }
  });
}
