/**
 * How long `answersGet` waits for a response before reporting the source
 * silent. Equal to the Content-Type probe's own bound: a host that accepts
 * the connection and never answers (feral-file#3583) is judged by the same
 * budget whichever request is asking.
 */
export const SOURCE_GET_TIMEOUT_MS = 10_000;

/**
 * Reports whether a source answers the request the fallback iframe itself
 * would make: a plain GET. Any HTTP response counts, whatever its status.
 *
 * Why this exists: the Content-Type probe is a cross-origin `HEAD`, and a
 * `HEAD` that got no response proves nothing on its own. A host may refuse
 * `HEAD` or omit CORS headers on it and still serve the page, and the
 * browser rejects all of those with the same bare error as a dead host. So
 * the `HEAD` only types a work; it never fails one. Before the player gives
 * up on a source whose `HEAD` got no answer, it asks the same question with
 * a GET. Without this, an unresolvable host (DNS, refused, an onchfs work the
 * device has not read from chain yet, ffos-user#427) mounts the fallback
 * iframe, which shows Chromium's own error page and reports it `ready` for
 * the whole item (ff-player#311, finding 1).
 *
 * `no-cors` makes the answer independent of CORS: the response is opaque,
 * and only a network failure (DNS, refused, reset, no answer in time)
 * rejects. Chromium's opaque-response blocking hands a blocked HTML body back
 * as an empty opaque response, not an error (checked on Chromium 137). The
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
 * @returns False only when no response arrived in time.
 */
export async function answersGet(
  url: string,
  timeoutMs: number = SOURCE_GET_TIMEOUT_MS
): Promise<boolean> {
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
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}
