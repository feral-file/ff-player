import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendDisplayModeParam,
  CONTENT_TYPE_HEAD_TIMEOUT_MS,
  getContentTypeFromURL,
} from './helper';

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

  it('infers GLB and glTF MIME types from extensions when HEAD fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(
      getContentTypeFromURL('https://example.com/artwork/model.glb')
    ).resolves.toBe('model/gltf-binary');
    await expect(
      getContentTypeFromURL('https://example.com/artwork/model.gltf')
    ).resolves.toBe('model/gltf+json');
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
    ).resolves.toBe('model/gltf-binary');
  });

  it.each([
    ['relative', 'artwork/model.glb', 'http://localhost/artwork/model.glb'],
    ['protocol-relative', '//cdn.example.com/model.glb', 'http://cdn.example.com/model.glb'],
  ])('resolves a %s source before looking up its content type', async (_kind, source, expectedURL) => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    vi.spyOn(console, 'log').mockImplementation(vi.fn());

    await expect(getContentTypeFromURL(source)).resolves.toBe('model/gltf-binary');

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

  it.each([
    ['image/png', 'data:image/png;base64,iVBORw0KGgo='],
    ['video/mp4', 'data:video/mp4;base64,AAAA'],
    ['audio/mpeg', 'data:audio/mpeg;base64,SUQz'],
    ['text/plain', 'data:,hello'],
  ])(
    'returns the declared %s type from a data URL without probing the network',
    async (expectedType, source) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(getContentTypeFromURL(source)).resolves.toBe(expectedType);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
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

    await expect(pending).resolves.toBe('model/gltf-binary');
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
