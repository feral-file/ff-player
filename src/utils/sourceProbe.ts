/**
 * How long `probeGet` waits for a response before reporting the source
 * silent. Equal to the Content-Type probe's own bound: a host that accepts
 * the connection and never answers (feral-file#3583) is judged by the same
 * budget whichever request is asking.
 */
export const SOURCE_GET_TIMEOUT_MS = 10_000;

/**
 * What a plain GET of a source got back. `answered`: a response that passed
 * the CORS check. `silent`: no response headers at all within
 * SOURCE_GET_TIMEOUT_MS; only a host that accepted the request and never
 * answered looks like this. `rejected`: the browser settled the request
 * early without a usable response. That is a network failure (DNS, refused,
 * reset) OR a response that DID arrive and failed the CORS check or a policy
 * such as `Cross-Origin-Resource-Policy: same-origin`, none of which stop the
 * iframe's navigation (ff-player#337 review F1). Script sees the same bare
 * TypeError for all of them, and Resource Timing does not separate them
 * either (checked on Chromium 137), so `rejected` alone proves nothing about
 * the source.
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
 * The request is CORS-mode, not `no-cors`, so that `silent` means what it
 * says: a CORS fetch settles as soon as response headers arrive, resolving
 * or failing the CORS check, while a `no-cors` fetch of HTML is held by
 * Chromium's opaque-response blocking until body bytes arrive, so a page that
 * flushes its headers and streams its body slowly would read as silent
 * (ff-player#337 review F3; both checked on Chromium 137). A simple GET
 * needs no preflight. The request is aborted once it settles, so the body is
 * not downloaded. `no-store` keeps the HTTP cache from answering for a host that
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
      mode: 'cors',
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
