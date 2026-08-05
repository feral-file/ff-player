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
import {
  ContentTypeDetectionError,
  DAEMON_VERDICT_WAIT_MS,
  getContentTypeFromURL,
} from './helper';
import {
  noteDaemonConnectivity,
  resetDaemonConnectivityForTests,
} from '@/services/DaemonConnectivity';

/**
 * Arm the no-response HEAD shape: `fetch` rejects with the bare TypeError a
 * genuine network failure and a CORS/CSP block share, console noise silenced,
 * `navigator.onLine` pinned to the given value.
 */
function armRejectedHead(onLine: boolean) {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(
    new TypeError('Failed to fetch')
  );
  vi.spyOn(console, 'log').mockImplementation(vi.fn());
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(onLine);
}

/** Run detection against an extensionless URL and capture its rejection. */
function classify(): Promise<unknown> {
  return getContentTypeFromURL('https://example.com/ipfs/bafy-test-cid').catch(
    (error: unknown) => error
  );
}

/** Assert the rejection is a ContentTypeDetectionError with the given verdict. */
function expectNetworkFailure(rejection: unknown, isNetworkFailure: boolean) {
  expect(rejection).toBeInstanceOf(ContentTypeDetectionError);
  expect((rejection as ContentTypeDetectionError).isNetworkFailure).toBe(
    isNetworkFailure
  );
}

afterEach(() => {
  resetDaemonConnectivityForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getContentTypeFromURL — network vs. reachable-server classification', () => {
  it('classifies a fetch rejection as a network failure when navigator.onLine corroborates it (cold offline boot)', async () => {
    armRejectedHead(false);
    expectNetworkFailure(await classify(), true);
  });

  it('does NOT classify a fetch rejection as a network failure when the device is online — the CORS/CSP case', async () => {
    // `fetch` rejects with the same bare TypeError for a genuine network
    // failure AND for a CORS/CSP/extension block — a third-party host that
    // is perfectly reachable but omits Access-Control-Allow-Origin on this
    // exact cache-busted HEAD (see the workaround comment in the source)
    // rejects identically to an offline device. Must fail if the
    // corroboration guard is dropped: without it, this ONLINE device would
    // raise the degraded flag with nothing left to ever clear it (a healthy,
    // playable artwork stuck degraded forever). The daemon verdict here says
    // online, which is the on-device shape of this case.
    armRejectedHead(true);
    noteDaemonConnectivity(true);
    expectNetworkFailure(await classify(), false);
  });

  it('classifies a reached-but-unhelpful HTTP response as NOT a network failure regardless of navigator.onLine', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404, statusText: 'Not Found' })
    );
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expectNetworkFailure(await classify(), false);
  });
});

describe('getContentTypeFromURL — daemon-verdict corroboration', () => {
  it('classifies a fetch rejection as a network failure when the daemon says offline while navigator.onLine reads true — the AP-mode shape', async () => {
    // The 2026-08-05 blank-wall incident: an offline frame with its own
    // setup AP up keeps the interface up, so `navigator.onLine` reads true
    // and the old onLine-only corroboration fell through to the fallback
    // iframe (whose cross-origin `load` masks failure) — the offline
    // backdrop never rose. The daemon's pushed verdict is the authoritative
    // WAN probe and must corroborate on its own.
    armRejectedHead(true);
    noteDaemonConnectivity(false);
    expectNetworkFailure(await classify(), true);
  });

  it('waits for a daemon verdict that lands mid-classification — the replay that arrived 7ms late', async () => {
    // In the field, the daemon's generation-ready connectivity replay landed
    // 7ms AFTER the HEAD failure was classified. The classification must
    // wait (bounded) for the first verdict instead of misreading "no verdict
    // yet" as "online".
    armRejectedHead(true);
    const pending = classify();
    // Let the rejection propagate to the corroboration wait, then deliver
    // the late verdict.
    await new Promise(resolve => setTimeout(resolve, 0));
    noteDaemonConnectivity(false);
    expectNetworkFailure(await pending, true);
  });

  it('resolves the wait early and stays uncorroborated when the late verdict says online — CORS on a healthy device', async () => {
    // The mirror of the late-`false` case, and the invariant the whole
    // corroboration exists for: an ONLINE device whose CORS-blocked HEAD
    // fails before the daemon replay lands must classify non-network once
    // the verdict arrives `true` — never stick a healthy artwork degraded.
    armRejectedHead(true);
    const pending = classify();
    await new Promise(resolve => setTimeout(resolve, 0));
    noteDaemonConnectivity(true);
    expectNetworkFailure(await pending, false);
  });

  it('times out to uncorroborated when no daemon verdict ever arrives — the standalone-browser shape', async () => {
    vi.useFakeTimers();
    armRejectedHead(true);
    const pending = classify();
    await vi.advanceTimersByTimeAsync(DAEMON_VERDICT_WAIT_MS);
    expectNetworkFailure(await pending, false);
  });
});
