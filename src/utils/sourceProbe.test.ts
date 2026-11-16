import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_GET_TIMEOUT_MS, answersGet } from './sourceProbe';

const URL = 'https://art.test/work';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('answersGet', () => {
  it('asks with a plain no-cors GET that bypasses the HTTP cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(answersGet(URL)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBeUndefined();
    expect(init.mode).toBe('no-cors');
    expect(init.cache).toBe('no-store');
  });

  it('counts any response, whatever its status, as an answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(answersGet(URL)).resolves.toBe(true);
  });

  it('aborts the request once headers arrive, so the body is not downloaded', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return Promise.resolve(new Response(null, { status: 200 }));
      })
    );
    await answersGet(URL);
    expect(signal?.aborted).toBe(true);
  });

  it('reports no answer when the request is rejected (DNS, refused)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(answersGet(URL)).resolves.toBe(false);
  });

  it('reports no answer when nothing arrives within the bound', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          })
      )
    );
    const pending = answersGet(URL);
    await vi.advanceTimersByTimeAsync(SOURCE_GET_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe(false);
  });
});
