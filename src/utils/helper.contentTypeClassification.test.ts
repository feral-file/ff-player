// @vitest-environment jsdom
// jsdom (not the node default for .test.ts, see helper.test.ts): this suite
// stubs `navigator.onLine`, which jsdom provides as a real, spy-able
// accessor (Node's own global `navigator.onLine` getter is not reliably
// configurable across Node versions). Split into its own file rather than
// added to helper.test.ts so that file's other cases keep running under the
// `node` project, where `resolveArtworkSourceURL`'s `window === undefined`
// fallback (`http://localhost`, no port) is what several of them assert
// against — switching that whole file to jsdom would silently resolve
// relative URLs against jsdom's `http://localhost:3000` instead.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentTypeDetectionError, getContentTypeFromURL } from './helper';

describe('getContentTypeFromURL — network vs. reachable-server classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies a fetch rejection as a network failure when navigator.onLine corroborates it (cold offline boot)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch')
    );
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const rejection = await getContentTypeFromURL(
      'https://example.com/ipfs/bafy-test-cid'
    ).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ContentTypeDetectionError);
    expect((rejection as ContentTypeDetectionError).isNetworkFailure).toBe(
      true
    );
  });

  it('does NOT classify a fetch rejection as a network failure when navigator.onLine is true — the CORS/CSP case', async () => {
    // `fetch` rejects with the same bare TypeError for a genuine network
    // failure AND for a CORS/CSP/extension block — a third-party host that
    // is perfectly reachable but omits Access-Control-Allow-Origin on this
    // exact cache-busted HEAD (see the workaround comment in the source)
    // rejects identically to an offline device. Must fail if the
    // `navigator.onLine` corroboration guard is dropped: without it, this
    // ONLINE device would raise the degraded flag with nothing left to ever
    // clear it (a healthy, playable artwork stuck degraded forever).
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch')
    );
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    const rejection = await getContentTypeFromURL(
      'https://example.com/ipfs/bafy-test-cid'
    ).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ContentTypeDetectionError);
    expect((rejection as ContentTypeDetectionError).isNetworkFailure).toBe(
      false
    );
  });

  it('classifies a reached-but-unhelpful HTTP response as NOT a network failure regardless of navigator.onLine', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404, statusText: 'Not Found' })
    );
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const rejection = await getContentTypeFromURL(
      'https://example.com/ipfs/bafy-test-cid'
    ).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ContentTypeDetectionError);
    expect((rejection as ContentTypeDetectionError).isNetworkFailure).toBe(
      false
    );
  });
});
