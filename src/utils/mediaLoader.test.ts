// @vitest-environment node
// Node supplies the real fetch Response, streams, Blob and URL.createObjectURL
// that the loader composes; jsdom lacks createObjectURL.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMediaWithCORS, type MediaElement } from './mediaLoader';

const URL_UNDER_TEST = 'https://ipfs.feralfile.com/ipfs/QmStill';

/** A stand-in element: the loader only ever assigns its `src`. */
function element(): MediaElement {
  return { src: '' } as unknown as MediaElement;
}

/** A 200 response whose body arrives in the given chunks. */
function streamed(chunks: number[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) {
        controller.enqueue(new Uint8Array(size));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'image/jpeg' } });
}

const fetchMock = vi.fn<typeof fetch>();

/** The `cache` mode of each fetch the loader made, in order. */
function cacheModes(): (RequestCache | undefined)[] {
  return fetchMock.mock.calls.map(call => call[1]?.cache);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadMediaWithCORS — streamed images', () => {
  it('streams through the HTTP cache, reports each chunk, then hands over the whole blob', async () => {
    fetchMock.mockResolvedValue(streamed([10, 20, 30]));
    const onProgress = vi.fn();
    const onPhase = vi.fn();
    const el = element();
    const created = vi.spyOn(URL, 'createObjectURL');

    const result = await loadMediaWithCORS({
      url: URL_UNDER_TEST,
      mediaType: 'image',
      element: el,
      onProgress,
      onPhase,
    });

    expect(result).toEqual({ success: true, usedBlob: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      mode: 'cors',
      cache: 'default',
    });
    // Headers, then one call per chunk.
    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(onPhase).toHaveBeenCalledExactlyOnceWith('decode');
    expect(el.src.startsWith('blob:')).toBe(true);
    const blob = created.mock.calls[0][0] as Blob;
    expect(blob.size).toBe(60);
    expect(blob.type).toBe('image/jpeg');
  });

  it('retries once with reload when the cached read is refused', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(streamed([5]));
    const onPhase = vi.fn();

    const result = await loadMediaWithCORS({
      url: URL_UNDER_TEST,
      mediaType: 'image',
      element: element(),
      onPhase,
    });

    expect(result.usedBlob).toBe(true);
    expect(cacheModes()).toEqual(['default', 'reload']);
    expect(onPhase).toHaveBeenCalledExactlyOnceWith('decode');
  });

});

describe('loadMediaWithCORS — image fallbacks', () => {
  it('falls back to the plain element load, flagged opaque, when CORS never succeeds', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const onPhase = vi.fn();
    const el = element();

    const result = await loadMediaWithCORS({
      url: URL_UNDER_TEST,
      mediaType: 'image',
      element: el,
      onPhase,
    });

    expect(result).toEqual({ success: true, usedBlob: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(el.src).toBe(URL_UNDER_TEST);
    expect(onPhase).toHaveBeenCalledExactlyOnceWith('opaque');
  });

  it('does not retry an HTTP error status before falling back', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 403 }));
    const el = element();

    await loadMediaWithCORS({
      url: URL_UNDER_TEST,
      mediaType: 'image',
      element: el,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(el.src).toBe(URL_UNDER_TEST);
  });

  it('neither retries nor falls back once aborted', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    const el = element();

    const result = await loadMediaWithCORS({
      url: URL_UNDER_TEST,
      mediaType: 'image',
      element: el,
      signal: controller.signal,
    });

    expect(result.success).toBe(false);
    expect(result.error?.name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(el.src).toBe('');
  });
});

describe('loadMediaWithCORS — time-based media', () => {
  it.each(['video', 'audio'] as const)(
    'assigns %s directly so the element streams with Range',
    async mediaType => {
      const el = element();

      const result = await loadMediaWithCORS({
        url: 'https://example.com/work.mp4',
        mediaType,
        element: el,
      });

      expect(result).toEqual({ success: true, usedBlob: false });
      expect(el.src).toBe('https://example.com/work.mp4');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
