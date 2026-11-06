import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendDisplayModeParam,
  CONTENT_TYPE_HEAD_TIMEOUT_MS,
  ContentTypeDetectionError,
  getContentTypeFromURL,
} from './helper';

/** `fetch`'s first argument as a comparable string, across every shape a mock may receive. */
function requestedURLString(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof Request ? input.url : input.toString();
}

describe('getContentTypeFromURL', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs structured error details when the HEAD request fails', async () => {
    const networkError = new Error('network down');
    networkError.cause = new Error('tls alert');

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(
      getContentTypeFromURL('https://example.com/ipfs/bafy-test-cid')
    ).rejects.toThrow('Failed to determine content type');

    expect(consoleLog).toHaveBeenCalledWith(
      '[ContentType] Failed to get content-type from HEAD request',
      expect.stringContaining('"message":"network down"')
    );
    expect(consoleLog).toHaveBeenCalledWith(
      '[ContentType] Failed to get content-type from HEAD request',
      expect.stringContaining('"cause":{"name":"Error","message":"tls alert"')
    );
  });
});

describe('getContentTypeFromURL — extension inference', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('infers GLB and glTF MIME types from extensions when HEAD fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(
      getContentTypeFromURL('https://example.com/artwork/model.glb')
    ).resolves.toEqual({
      contentType: 'model/gltf-binary',
      resolvedURL: 'https://example.com/artwork/model.glb',
    });
    await expect(
      getContentTypeFromURL('https://example.com/artwork/model.gltf')
    ).resolves.toEqual({
      contentType: 'model/gltf+json',
      resolvedURL: 'https://example.com/artwork/model.gltf',
    });
  });

  it('prefers GLB extension inference when HEAD returns a generic binary type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        status: 200,
      })
    );

    await expect(
      getContentTypeFromURL('https://example.com/artwork/model.glb')
    ).resolves.toEqual({
      contentType: 'model/gltf-binary',
      resolvedURL: 'https://example.com/artwork/model.glb',
    });
  });
});

describe('getContentTypeFromURL — URL resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['relative', 'artwork/model.glb', 'http://localhost/artwork/model.glb'],
    ['protocol-relative', '//cdn.example.com/model.glb', 'http://cdn.example.com/model.glb'],
  ])('resolves a %s source before looking up its content type', async (_kind, source, expectedURL) => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(source)).resolves.toEqual({
      contentType: 'model/gltf-binary',
      resolvedURL: source,
    });

    const [requestURL, requestInit] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(requestURL).toMatch(
      new RegExp(`^${expectedURL}\\?v=\\d+&x-request=xhr$`)
    );
    // `signal` bounds the HEAD probe itself (feral-file/ff-player#307) so a
    // gateway that never responds cannot hang this promise forever; it is
    // asserted separately below rather than via a literal `AbortSignal`
    // instance, which this mocked call never receives back to compare.
    expect(requestInit).toMatchObject({ method: 'HEAD' });
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('getContentTypeFromURL — data URLs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['image/png', 'data:image/png;base64,iVBORw0KGgo='],
    ['video/mp4', 'data:video/mp4;base64,AAAA'],
    ['audio/mpeg', 'data:audio/mpeg;base64,SUQz'],
    ['text/plain', 'data:,hello'],
  ])(
    'returns the declared %s type from a data URL without probing the network',
    async (expectedType, source) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(getContentTypeFromURL(source)).resolves.toEqual({
        contentType: expectedType,
        resolvedURL: source,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});

// feral-file/feral-file#3583: Raster hands back a dead Infura gateway
// (`0prod.infura-ipfs.io`) for a CID that Feral File's own gateway does not
// pin (404) but Filebase mirrors (200) — matching ff-app's
// `ipfsMediaCandidates()` fallback chain exactly.
const DEAD_GATEWAY_URL =
  'https://0prod.infura-ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const FERALFILE_URL =
  'https://ipfs.feralfile.com/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const FILEBASE_URL =
  'https://ipfs.filebase.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

/** A resolved HEAD `Response` reporting the given `Content-Type`. */
function okContentTypeResponse(contentType: string): Response {
  return new Response(null, { headers: { 'Content-Type': contentType }, status: 200 });
}

describe('getContentTypeFromURL — IPFS gateway fallback candidate order', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls through to the next gateway candidate when an earlier one fails, and renders from the one that answers', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((requestURL: string | URL | Request) => {
        if (requestedURLString(requestURL).startsWith(FILEBASE_URL)) {
          return Promise.resolve(okContentTypeResponse('image/jpeg'));
        }
        return Promise.reject(new Error('blocked'));
      });
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(DEAD_GATEWAY_URL)).resolves.toEqual({
      contentType: 'image/jpeg',
      resolvedURL: FILEBASE_URL,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const requestedURLs = fetchSpy.mock.calls.map(call => requestedURLString(call[0]));
    expect(requestedURLs[0]).toMatch(new RegExp(`^${DEAD_GATEWAY_URL}\\?`));
    expect(requestedURLs[1]).toMatch(new RegExp(`^${FERALFILE_URL}\\?`));
    expect(requestedURLs[2]).toMatch(new RegExp(`^${FILEBASE_URL}\\?`));
  });

  it('never probes a fallback gateway when the original host already answers', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okContentTypeResponse('image/jpeg'));

    await expect(getContentTypeFromURL(DEAD_GATEWAY_URL)).resolves.toEqual({
      contentType: 'image/jpeg',
      resolvedURL: DEAD_GATEWAY_URL,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('never probes a fallback gateway for a non-content-addressed URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL('https://cdn.example.com/artwork/preview')).rejects.toThrow(
      'Failed to determine content type'
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('renders from a candidate that answered 2xx without a Content-Type, not the dead original host, when extension inference supplies the type', async () => {
    // feralfile.com has the CID (2xx) but this HEAD happens to omit
    // Content-Type; filebase.io does NOT have it (404, reached but
    // unhelpful). Extension inference succeeds either way, but the only
    // candidate actually proven to serve the resource is feralfile.com —
    // resolving to the dead original or the 404'd filebase would reproduce
    // the broken image this fallback exists to fix.
    const deadURLWithExt = `${DEAD_GATEWAY_URL}/preview.jpg`;
    const feralfileURLWithExt = `${FERALFILE_URL}/preview.jpg`;
    const filebaseURLWithExt = `${FILEBASE_URL}/preview.jpg`;
    vi.spyOn(globalThis, 'fetch').mockImplementation((requestURL: string | URL | Request) => {
      const requested = requestedURLString(requestURL);
      if (requested.startsWith(feralfileURLWithExt)) {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      if (requested.startsWith(filebaseURLWithExt)) {
        return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }));
      }
      return Promise.reject(new Error('blocked'));
    });
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(deadURLWithExt)).resolves.toEqual({
      contentType: 'image/jpeg',
      resolvedURL: feralfileURLWithExt,
    });
  });
});

// feralfile-bot review of PR #328, F1: a gateway-scoped credential (e.g.
// Pinata's `pinataGatewayToken`) in the original host's query string must
// never be copied onto a fallback gateway that never issued it — doing so
// both leaks the credential to an unrelated operator and fails there
// anyway. Matches ff-app's `_artworkQueryKeys` allow-list exactly.
describe('getContentTypeFromURL — IPFS gateway fallback query filtering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops a gateway credential from the fallback request, keeping only artwork-identity parameters', async () => {
    const urlWithToken = `${DEAD_GATEWAY_URL}?pinataGatewayToken=secret&seed=42`;
    const feralfileFiltered = `${FERALFILE_URL}?seed=42`;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((requestURL: string | URL | Request) => {
        if (requestedURLString(requestURL).startsWith(feralfileFiltered)) {
          return Promise.resolve(okContentTypeResponse('image/jpeg'));
        }
        return Promise.reject(new Error('blocked'));
      });
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(urlWithToken)).resolves.toEqual({
      contentType: 'image/jpeg',
      resolvedURL: feralfileFiltered,
    });

    const requestedURLs = fetchSpy.mock.calls.map(call =>
      requestedURLString(call[0])
    );
    // The original host legitimately keeps its own credential; only the
    // fallback candidate (not the one that issued it) must drop it.
    expect(requestedURLs[0]).toContain('pinataGatewayToken');
    expect(requestedURLs[1]).not.toContain('pinataGatewayToken');
    expect(requestedURLs[1].startsWith(`${feralfileFiltered}&`)).toBe(true);
  });

  it('drops the whole query from a fallback candidate when nothing in it is an artwork-identity key', async () => {
    const urlWithOnlyToken = `${DEAD_GATEWAY_URL}?pinataGatewayToken=secret`;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((requestURL: string | URL | Request) => {
        if (requestedURLString(requestURL).startsWith(FERALFILE_URL)) {
          return Promise.resolve(okContentTypeResponse('image/jpeg'));
        }
        return Promise.reject(new Error('blocked'));
      });
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(urlWithOnlyToken)).resolves.toEqual({
      contentType: 'image/jpeg',
      resolvedURL: FERALFILE_URL,
    });

    const requestedURLs = fetchSpy.mock.calls.map(call =>
      requestedURLString(call[0])
    );
    expect(requestedURLs[1]).toMatch(new RegExp(`^${FERALFILE_URL}\\?v=`));
  });
});

// feralfile-bot review of PR #328, F4: an HTML artwork that reads its seed
// or viewing state from `location.hash` must get the same fragment on a
// fallback gateway as on the original host — dropping it silently changes
// the artwork's input.
describe('getContentTypeFromURL — IPFS gateway fallback fragment preservation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the URL fragment in a fallback candidate', async () => {
    const urlWithFragment = `${DEAD_GATEWAY_URL}/index.html#seed=42`;
    const feralfileWithFragment = `${FERALFILE_URL}/index.html#seed=42`;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (requestURL: string | URL | Request) => {
        if (requestedURLString(requestURL).startsWith(`${FERALFILE_URL}/index.html`)) {
          return Promise.resolve(okContentTypeResponse('text/html'));
        }
        return Promise.reject(new Error('blocked'));
      }
    );
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(urlWithFragment)).resolves.toEqual({
      contentType: 'text/html',
      resolvedURL: feralfileWithFragment,
    });
  });

  it('preserves both the filtered query and the fragment together', async () => {
    const urlWithBoth = `${DEAD_GATEWAY_URL}/index.html?pinataGatewayToken=secret&seed=42#seed=42`;
    const feralfileFiltered = `${FERALFILE_URL}/index.html?seed=42#seed=42`;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (requestURL: string | URL | Request) => {
        if (requestedURLString(requestURL).startsWith(`${FERALFILE_URL}/index.html?seed=42`)) {
          return Promise.resolve(okContentTypeResponse('text/html'));
        }
        return Promise.reject(new Error('blocked'));
      }
    );
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(urlWithBoth)).resolves.toEqual({
      contentType: 'text/html',
      resolvedURL: feralfileFiltered,
    });
  });
});

// feralfile-bot review of PR #328, F3: `isContentAddressed`'s old
// `length >= 46` heuristic rejected structurally valid shorter CIDs (e.g. a
// CIDv1 with a 20-byte SHA-1 digest, instead of the common 32-byte SHA-256
// one), so those sources never got fallback candidates at all.
describe('getContentTypeFromURL — shorter structurally-valid CIDs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A real CIDv1, base32, dag-pb codec, sha1 multihash (20-byte digest) —
  // 40 characters, under the old 46-character floor.
  const SHORT_CID = 'bafkrcfhxbysec5n6j6lken5hjblx6khttxj4psy';
  const SHORT_CID_DEAD_URL = `https://dead.example/ipfs/${SHORT_CID}`;
  const SHORT_CID_FERALFILE_URL = `https://ipfs.feralfile.com/ipfs/${SHORT_CID}`;
  const SHORT_CID_FILEBASE_URL = `https://ipfs.filebase.io/ipfs/${SHORT_CID}`;

  it('walks the fallback gateways for a short, structurally valid CIDv1', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((requestURL: string | URL | Request) => {
        if (requestedURLString(requestURL).startsWith(SHORT_CID_FILEBASE_URL)) {
          return Promise.resolve(okContentTypeResponse('image/jpeg'));
        }
        return Promise.reject(new Error('blocked'));
      });
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(SHORT_CID_DEAD_URL)).resolves.toEqual({
      contentType: 'image/jpeg',
      resolvedURL: SHORT_CID_FILEBASE_URL,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const requestedURLs = fetchSpy.mock.calls.map(call =>
      requestedURLString(call[0])
    );
    expect(requestedURLs[1]).toMatch(new RegExp(`^${SHORT_CID_FERALFILE_URL}`));
  });

  it('does not treat an arbitrary short alphanumeric path segment as a CID', async () => {
    // Not a valid multibase/multihash encoding at all — must stay a
    // single-candidate source, same as any other non-content-addressed URL.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(
      getContentTypeFromURL('https://example.com/ipfs/not-a-real-cid')
    ).rejects.toThrow('Failed to determine content type');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('getContentTypeFromURL — IPFS gateway fallback timeout budget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('bounds every candidate by its own timeout instead of sharing one budget', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (requestURL: string | URL | Request, init?: RequestInit) => {
        if (requestedURLString(requestURL).startsWith(FILEBASE_URL)) {
          return Promise.resolve(okContentTypeResponse('image/jpeg'));
        }
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      }
    );
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    const pending = getContentTypeFromURL(DEAD_GATEWAY_URL);
    await vi.advanceTimersByTimeAsync(CONTENT_TYPE_HEAD_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(CONTENT_TYPE_HEAD_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      contentType: 'image/jpeg',
      resolvedURL: FILEBASE_URL,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('getContentTypeFromURL — exhaustedGatewayCandidates classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws ContentTypeDetectionError.exhaustedGatewayCandidates when every gateway fails and the path has no inferable extension', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    const rejection: unknown = await getContentTypeFromURL(DEAD_GATEWAY_URL).catch(
      (error: unknown) => error
    );

    expect(rejection).toBeInstanceOf(ContentTypeDetectionError);
    expect((rejection as ContentTypeDetectionError).exhaustedGatewayCandidates).toBe(true);
  });

  it('does not set exhaustedGatewayCandidates for a plain, non-content-addressed URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    const rejection: unknown = await getContentTypeFromURL(
      'https://cdn.example.com/artwork/preview'
    ).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(ContentTypeDetectionError);
    expect((rejection as ContentTypeDetectionError).exhaustedGatewayCandidates).toBe(false);
  });

  it('throws exhaustedGatewayCandidates instead of resolving to the dead original host, even when the path has an inferable extension', async () => {
    // Every gateway candidate — including the two fallbacks — rejects
    // outright (no candidate is ever proven live), but the path still ends
    // in a recognizable extension. Resolving "successfully" here would hand
    // the renderer `previewURL` itself: the one host already proven dead,
    // reproducing feral-file/feral-file#3583's broken image under a type
    // guess instead of a network error.
    const deadURLWithExt = `${DEAD_GATEWAY_URL}/preview.png`;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    const rejection: unknown = await getContentTypeFromURL(deadURLWithExt).catch(
      (error: unknown) => error
    );

    expect(rejection).toBeInstanceOf(ContentTypeDetectionError);
    expect((rejection as ContentTypeDetectionError).exhaustedGatewayCandidates).toBe(true);
  });
});

describe('getContentTypeFromURL — HEAD probe timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('aborts the HEAD probe instead of hanging forever when the gateway never responds', async () => {
    // feral-file/ff-player#307: a gateway that accepts the connection but
    // never replies must not leave this promise pending forever, or nothing
    // downstream (the M7 refresh budget, the render-failure retry/skip) ever
    // sees a failure to act on.
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_url, init) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      });
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    const pending = getContentTypeFromURL('https://example.com/artwork/model.glb');
    await vi.advanceTimersByTimeAsync(CONTENT_TYPE_HEAD_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      contentType: 'model/gltf-binary',
      resolvedURL: 'https://example.com/artwork/model.glb',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * `appendDisplayModeParam` is one half of a round trip whose other half lives
 * in another repository: controld's `stripQueryParams`
 * (ffos-user, components/feral-controld/offlinecache/replay.go) removes
 * `display_mode` and matches what is left against the captured bare
 * `item.Source` by exact string. The append is only correct if that strip
 * returns the original source byte-for-byte, so these tests assert the round
 * trip rather than just the appended form — a same-repo assertion on the
 * output alone would have accepted the empty-query regression this covers.
 *
 * `stripDisplayMode` below mirrors controld's strip exactly: split the query
 * on `&`, drop `display_mode` pairs, preserve every other pair verbatim
 * (empty ones included, since an empty pair is how a source's explicit empty
 * query survives the append), and emit no `?` at all when nothing is left.
 */
function stripDisplayMode(rawURL: string): string {
  const queryStart = rawURL.indexOf('?');
  if (queryStart === -1) {
    return rawURL;
  }
  const base = rawURL.slice(0, queryStart);
  let query = rawURL.slice(queryStart + 1);
  let fragment = '';
  const fragmentStart = query.indexOf('#');
  if (fragmentStart >= 0) {
    fragment = query.slice(fragmentStart);
    query = query.slice(0, fragmentStart);
  }
  const kept = query
    .split('&')
    .filter(pair => pair.split('=')[0] !== 'display_mode');
  if (kept.length === 0) {
    return base + fragment;
  }
  return `${base}?${kept.join('&')}${fragment}`;
}

describe('appendDisplayModeParam', () => {
  const sources = [
    ['no query string', 'https://generator.artblocks.io/1/0xabc/147000065'],
    ['explicit empty query', 'https://cdn.example.com/a?'],
    ['existing query', 'https://cdn.example.com/previews/x/?edition_number=0&blockchain=bitmark'],
    ['percent-encoded query', 'https://cdn.example.com/a?path=%2Fnested&b=1'],
    ['fragment only', 'https://cdn.example.com/a#frag'],
    ['empty query and fragment', 'https://cdn.example.com/a?#frag'],
    ['question mark inside fragment', 'https://cdn.example.com/a#b?c'],
  ] as const;

  it.each(sources)(
    'round-trips a source with %s back to the captured replay key',
    (_kind, source) => {
      const appended = appendDisplayModeParam(new URL(source), 'fit');

      expect(appended).toContain('display_mode=fit');
      expect(stripDisplayMode(appended)).toBe(source);
    }
  );

  it('preserves the delimiter that distinguishes no query from an empty query', () => {
    // `URL.search` is '' for both, so reading the delimiter from `search`
    // collapses these two into one output and breaks whichever it does not
    // pick. They must stay distinguishable, because their captured replay
    // keys differ by exactly the trailing '?'.
    expect(appendDisplayModeParam(new URL('https://h/a'), 'fit')).toBe(
      'https://h/a?display_mode=fit'
    );
    expect(appendDisplayModeParam(new URL('https://h/a?'), 'fit')).toBe(
      'https://h/a?&display_mode=fit'
    );
  });

  it('appends without reordering or re-encoding existing parameters', () => {
    // Guards against a URLSearchParams-based implementation, whose
    // re-serialization would resort and re-encode these and miss the
    // exact-string lookup for a different reason.
    expect(
      appendDisplayModeParam(
        new URL('https://h/a?edition_number=0&blockchain=bitmark&path=%2Fx'),
        'crop'
      )
    ).toBe(
      'https://h/a?edition_number=0&blockchain=bitmark&path=%2Fx&display_mode=crop'
    );
  });

  it('does not mutate the URL passed in', () => {
    const source = new URL('https://h/a?b=1');
    appendDisplayModeParam(source, 'fit');
    expect(source.toString()).toBe('https://h/a?b=1');
  });
});
