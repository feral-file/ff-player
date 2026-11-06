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
