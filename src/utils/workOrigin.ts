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
 * is not its own hostname. Third, the shell shows the work in a child
 * frame pointed at a blob of those bytes and stays alive under it (it owns
 * the blob URL, so a work that reloads itself keeps working); the child is a
 * real navigation, so Chromium decodes the work exactly as a direct load. The
 * shell reports `loaded` (or `error`) over a MessagePort the player sent with
 * `open`, for the child's first trusted load: that report, once, is the
 * completion signal, and the iframe's own `load` (the shell's) is not. The
 * work is same-origin with its shell and can run code in its realm, so only
 * the port, held in the shell's closure, is trusted; the player answers only
 * the first `ready` per frame, before the work exists.
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
// Either probe answer expires after this long: a miss in case the server was
// still starting, a hit in case it has since died. Only a slot choosing its
// path asks (the player keeps a slot on the path it took), so a playing work
// is never re-routed by a fresh answer.
const PROBE_TTL_MS = 60_000;

// data: URL without fragment -> label ('' when hashing failed).
const labelBySource = new Map<string, string>();
const pendingSources = new Set<string>();
let serverAvailable: boolean | undefined;
let serverCheckedAt = 0;
let probeInFlight = false;
// Everyone waiting on a probe or a hash, notified when either settles: a
// player that mounts while another's probe is in flight must hear it too.
const listeners = new Set<() => void>();

/** Tell every subscriber that a probe or label settled. */
function notifyListeners(): void {
  listeners.forEach(listener => {
    listener();
  });
}

/**
 * Subscribe to work-origin resolutions (a works-server probe or a label hash
 * settling); returns the unsubscribe function.
 */
export function subscribeWorkOrigins(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the last probe answer is recent enough to act on. */
function serverAnswerFresh(): boolean {
  return (
    serverAvailable !== undefined &&
    Date.now() - serverCheckedAt <= PROBE_TTL_MS
  );
}

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
  const knownMissing = serverAvailable === false && serverAnswerFresh();
  return isHTMLDataURL(source) && onLoopback() && !knownMissing;
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

/** Probe for the works server unless a fresh answer is cached or in flight. */
function checkServer(): void {
  if (probeInFlight || serverAnswerFresh()) {
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
      notifyListeners();
    });
}

/** Hash `body` into its label once, notifying subscribers when it is cached. */
function checkLabel(body: string): void {
  if (labelBySource.has(body) || pendingSources.has(body)) {
    return;
  }
  pendingSources.add(body);
  void workOriginLabel(body)
    .catch(() => '')
    .then(label => {
      labelBySource.set(body, label);
      pendingSources.delete(body);
      notifyListeners();
    });
}

/**
 * Where an HTML `data:` source plays: its work origin (`ready`), not yet known
 * while the label hashes or a fresh works-server answer is awaited
 * (`pending`; subscribers hear when that settles), or `unavailable` for
 * everything else, which keeps the blob path. Call it when a slot chooses its
 * path, not for a slot already playing.
 */
export function resolveWorkOrigin(source: string): WorkOriginState {
  if (!isHTMLDataURL(source) || !onLoopback()) {
    return { kind: 'unavailable' };
  }
  checkServer();
  if (!serverAnswerFresh()) {
    return { kind: 'pending' };
  }
  if (serverAvailable === false) {
    return { kind: 'unavailable' };
  }
  const [body] = splitFragment(source.trim());
  checkLabel(body);
  const label = labelBySource.get(body);
  if (label === '') {
    return { kind: 'unavailable' };
  }
  if (label === undefined) {
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
