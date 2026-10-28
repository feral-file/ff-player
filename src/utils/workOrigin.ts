/**
 * Device-local origins for fully on-chain HTML works.
 *
 * A work whose source is a `data:text/html` URL (a token's own
 * `animation_url`) gets no storage and no secure context when loaded straight
 * from that URL, so it dies on its first `localStorage` read and loses WebGPU.
 * The blob path in `dataDocument.ts` restores WebGPU only. On an FF1 whose OS
 * runs the works server, the player instead loads the work at
 * `http://<label>.localhost:8081/`, where `<label>` is the first 128 bits of
 * the SHA-256 of the `data:` URL (fragment excluded). Chromium resolves
 * `*.localhost` to loopback and treats it as a secure context, so each work
 * gets WebGPU and storage of its own, cross-origin to the player and to every
 * other work.
 *
 * Three rules keep that sound (feral-file/feral-file#3587). First, FF OS
 * (`serve-feral-player.sh` in ffos-user) serves port 8081 from the bundle's
 * `data-document/` directory, which holds only the shell
 * (`public/data-document/index.html`), so no other bundle page can be booted
 * in a work's origin; keep `WORK_ORIGIN_PORT` in step with that script.
 * Second, the bytes travel by `postMessage`, not in the URL, so a large work
 * never outgrows Chromium's 2 MB URL limit: the shell posts `ready`, the
 * player answers with the source, and the shell refuses anything whose hash
 * is not its own hostname before writing the work into its document. Third,
 * the shell reports `loaded` (or `error`) when the work itself has finished
 * loading; for these frames that message, not the iframe's `load` event, is
 * the completion signal, because the shell's own `load` comes before the work
 * exists.
 *
 * Off loopback (the player deployed as a website), or on an OS without the
 * works server, `data:` works keep the blob path.
 */

export const WORK_ORIGIN_PORT = 8081;

export const WORK_ORIGIN_MESSAGE = {
  ready: 'ff-data-document:ready',
  open: 'ff-data-document:open',
  loaded: 'ff-data-document:loaded',
  error: 'ff-data-document:error',
} as const;

export type WorkOriginState =
  | { kind: 'ready'; url: string }
  | { kind: 'pending' }
  | { kind: 'unavailable' };

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const PROBE_TIMEOUT_MS = 2000;
// An OS without the works server answers the probe with a refused
// connection; ask again after this long in case the server was still
// starting.
const PROBE_RETRY_MS = 60_000;

// data: URL without fragment -> label ('' when hashing failed).
const labelBySource = new Map<string, string>();
const pendingSources = new Set<string>();
let serverAvailable: boolean | undefined;
let serverCheckedAt = 0;
let probeInFlight = false;

/** Split a URL at its first `#`; a fragment is never part of a data: body. */
export function splitFragment(url: string): [string, string] {
  const hash = url.indexOf('#');
  return hash === -1 ? [url, ''] : [url.slice(0, hash), url.slice(hash)];
}

/**
 * Hex of the first 16 bytes of SHA-256 over `body`: a 32-character DNS label.
 * The shell computes the same value; keep the two in step.
 */
export async function workOriginLabel(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body)
  );
  return Array.from(new Uint8Array(digest).slice(0, 16), b =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

/** Whether the player runs on loopback, as it does on an FF1. */
function onLoopback(): boolean {
  const location = globalThis.location as Location | undefined;
  return location !== undefined && LOOPBACK_HOSTS.has(location.hostname);
}

/** Whether `source` is a `data:` URL declaring an HTML document. */
function isHTMLDataURL(source: string): boolean {
  return /^data:text\/html\s*[;,]/i.test(source.trim());
}

/**
 * Whether `source` would play in a work origin, as far as is known now: an
 * HTML `data:` source on a loopback player whose works server has not been
 * found missing. Lets callers avoid mounting a bare `data:` frame first.
 */
export function usesWorkOrigin(source: string): boolean {
  return isHTMLDataURL(source) && onLoopback() && serverAvailable !== false;
}

/** Whether `url` is a work-origin frame URL made by `resolveWorkOrigin`. */
export function isWorkOriginURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' &&
      parsed.hostname.endsWith('.localhost') &&
      parsed.port === String(WORK_ORIGIN_PORT)
    );
  } catch {
    return false;
  }
}

/**
 * Probe once for the works server (again after a miss goes stale) and call
 * `onReady` with the answer.
 */
function checkServer(onReady: () => void): void {
  const stale =
    serverAvailable === false &&
    Date.now() - serverCheckedAt > PROBE_RETRY_MS;
  if (probeInFlight || (serverAvailable !== undefined && !stale)) {
    return;
  }
  probeInFlight = true;
  // An opaque no-cors response is enough: it proves something answers on the
  // works port, and the shell's handshake proves the rest.
  void fetch(`http://ffos-probe.localhost:${String(WORK_ORIGIN_PORT)}/`, {
    mode: 'no-cors',
    cache: 'no-store',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  })
    .then(
      () => true,
      () => false
    )
    .then(available => {
      serverAvailable = available;
      serverCheckedAt = Date.now();
      probeInFlight = false;
      onReady();
    });
}

/** Hash `body` into its label once and call `onReady` when it is cached. */
function checkLabel(body: string, onReady: () => void): void {
  if (labelBySource.has(body) || pendingSources.has(body)) {
    return;
  }
  pendingSources.add(body);
  void workOriginLabel(body)
    .catch(() => '')
    .then(label => {
      labelBySource.set(body, label);
      pendingSources.delete(body);
      onReady();
    });
}

/**
 * Where an HTML `data:` source plays: its work origin (`ready`), not yet known
 * while the label hashes or the works server is probed (`pending`, and
 * `onReady` fires when that changes), or `unavailable` for everything else,
 * which keeps the blob path.
 */
export function resolveWorkOrigin(
  source: string,
  onReady: () => void
): WorkOriginState {
  if (!isHTMLDataURL(source) || !onLoopback()) {
    return { kind: 'unavailable' };
  }
  checkServer(onReady);
  if (serverAvailable === false) {
    return { kind: 'unavailable' };
  }
  const [body] = splitFragment(source.trim());
  checkLabel(body, onReady);
  const label = labelBySource.get(body);
  if (label === '') {
    return { kind: 'unavailable' };
  }
  if (serverAvailable === undefined || label === undefined) {
    return { kind: 'pending' };
  }
  return {
    kind: 'ready',
    url: `http://${label}.localhost:${String(WORK_ORIGIN_PORT)}/`,
  };
}

/** Drop cached labels for every source not in `inUse` (keys are whole data: URLs). */
export function forgetWorkOrigins(inUse: Iterable<string>): void {
  const keep = new Set(
    Array.from(inUse, source => splitFragment(source.trim())[0])
  );
  labelBySource.forEach((_label, body) => {
    if (!keep.has(body)) {
      labelBySource.delete(body);
    }
  });
}

/** Test seam: forget the works-server probe result. */
export function resetWorkOriginServerForTests(): void {
  serverAvailable = undefined;
  serverCheckedAt = 0;
  probeInFlight = false;
}
