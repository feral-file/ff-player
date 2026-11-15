/**
 * How long `loadsAsImage` waits for the browser to decode a source before
 * giving up. The probe runs only after the Content-Type probe has already
 * failed, on the way to the untyped iframe fallback, so this bounds how long
 * that fallback is held back. A gateway slow enough to exceed it is shown in
 * the iframe exactly as before.
 */
export const IMAGE_PROBE_TIMEOUT_MS = 8_000;

/**
 * Reports whether a source decodes as an image, by asking the browser to load
 * and decode it.
 *
 * Why this exists: the player picks a renderer from the source's
 * `Content-Type`, read with a cross-origin `HEAD`. That request can fail for a
 * source that is perfectly fine: a public IPFS gateway rate-limits or answers
 * 5xx for a moment, or omits CORS headers on the `HEAD`. An extensionless URL
 * (every bare IPFS CID) then has no type at all and falls to the untyped
 * iframe, where an image draws at its natural size in the top-left corner
 * instead of at the display's scaling: an 800 px GIF covers about a third of
 * a 4K panel's height (seen on an FF1, 2026-11-15, with p1xelfool's "ezix").
 * An `<img>` load needs neither `HEAD` nor CORS, so it settles the one case
 * that looks wrong: the source was an image all along.
 *
 * `decode()` is used rather than `load`/`error` listeners because it is one
 * promise that rejects for both a failed load and a body that is not an
 * image, and because an environment without it (jsdom) proves nothing, which
 * is reported as "not shown to be an image" at once instead of waiting out
 * the timeout.
 *
 * Trade-off, accepted: an SVG also decodes as an image, so an SVG whose type
 * probe failed now draws in the image slot (scaled, scripts not run) where it
 * used to draw in the iframe (unscaled, scripts run). A typed SVG is
 * unaffected; it never reaches this probe.
 *
 * @param url - Absolute http(s) URL of the source.
 * @param timeoutMs - Upper bound on the wait.
 * @returns True only when the browser decoded the source as an image in time.
 */
export async function loadsAsImage(
  url: string,
  timeoutMs: number = IMAGE_PROBE_TIMEOUT_MS
): Promise<boolean> {
  if (typeof Image === 'undefined') {
    return false;
  }
  const image = new Image();
  if (typeof image.decode !== 'function') {
    return false;
  }
  image.src = url;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>(resolve => {
    timeoutId = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      image.decode().then(
        () => true,
        () => false
      ),
      timedOut,
    ]);
  } finally {
    clearTimeout(timeoutId);
    // Drop the request if it is still in flight; a decoded image stays in
    // the HTTP cache for the slot's own <img>.
    image.src = '';
  }
}
