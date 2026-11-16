/**
 * How long `probeGet` waits for a response before reporting the source
 * silent. Equal to the Content-Type probe's own bound: a host that accepts
 * the connection and never answers (feral-file#3583) is judged by the same
 * budget whichever request is asking.
 */
export const SOURCE_GET_TIMEOUT_MS = 10_000;

/**
 * What a plain GET of a source got back. `answered`: an HTTP response,
 * whatever its status. `silent`: nothing at all within SOURCE_GET_TIMEOUT_MS;
 * a browser policy block (CORP, ORB) acts on a response that arrived, so it
 * can never look like this, only a host that accepted the request and never
 * answered can. `rejected`: the browser refused the request early. That is a
 * network failure (DNS, refused, reset) OR a policy block of a response that
 * DID arrive, e.g. `Cross-Origin-Resource-Policy: same-origin`, which blocks
 * this fetch but not the iframe's navigation (ff-player#337 review F1).
 * Script sees the same bare TypeError for both, and Resource Timing does not
 * separate them either (checked on Chromium 137), so `rejected` alone proves
 * nothing about the source.
 */
export type GetProbeResult = 'answered' | 'silent' | 'rejected';

/**
 * Asks a source the request the fallback iframe itself would make: a plain
 * GET.
 *
 * Why this exists: the Content-Type probe is a cross-origin `HEAD`, and a
 * `HEAD` that got no response proves nothing on its own. A host may refuse
 * `HEAD` or omit CORS headers on it and still serve the page, and the
 * browser rejects all of those with the same bare error as a dead host. So
 * the `HEAD` only types a work; it never fails one. Before the player gives
 * up on a source whose `HEAD` got no answer, it asks again with a GET. See
 * GetProbeResult for which answers are evidence.
 *
 * `no-cors` makes the answer independent of CORS: the response is opaque.
 * Chromium's opaque-response blocking hands a blocked HTML body back as an
 * empty opaque response, not an error (checked on Chromium 137). The
 * request is aborted as soon as headers arrive, so the body is not
 * downloaded. `no-store` keeps the HTTP cache from answering for a host that
 * has since gone. It does not bypass the offline cache's kiosk replay, which
 * intercepts the request itself and answers a recorded source URL (an onchfs
 * work the device has read included).
 *
 * Trade-off, accepted: one extra request per mount, only for a source whose
 * `HEAD` got no response while the device is online.
 *
 * @param url - Absolute http(s) URL of the source, without the HEAD's cache-busting query.
 * @param timeoutMs - Upper bound on the wait for a response.
 * @returns How the request ended; see GetProbeResult.
 */
export async function probeGet(
  url: string,
  timeoutMs: number = SOURCE_GET_TIMEOUT_MS
): Promise<GetProbeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return 'answered';
  } catch {
    // Only the timeout aborts before `finally` runs.
    return controller.signal.aborted ? 'silent' : 'rejected';
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}

/**
 * Reports a host under the reserved `.invalid` top-level domain (RFC 6761),
 * which no resolver ever answers. Only an interceptor on the device can
 * serve one: the offline cache's kiosk replay serves every onchfs work as
 * `https://<root>.onchfs.invalid/…` (ffos-user#427). A rejected request to
 * such a host is therefore proof that nothing on the device holds the
 * source, not a possible policy block.
 *
 * @param url - Absolute URL of the source.
 * @returns True for `invalid` and any `*.invalid` host.
 */
export function isUnresolvableHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }
  return host === 'invalid' || host.endsWith('.invalid');
}
