import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SOURCE_GET_TIMEOUT_MS,
  isUnresolvableHost,
  probeGet,
} from './sourceProbe';

const URL = 'https://art.test/work';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('probeGet', () => {
  it('asks with a plain no-cors GET that bypasses the HTTP cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeGet(URL)).resolves.toBe('answered');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBeUndefined();
    expect(init.mode).toBe('no-cors');
    expect(init.cache).toBe('no-store');
  });

  it('counts any response, whatever its status, as an answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(probeGet(URL)).resolves.toBe('answered');
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
    await probeGet(URL);
    expect(signal?.aborted).toBe(true);
  });

  it('reports an early rejection (DNS, refused, a CORP block) as rejected, not silent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(probeGet(URL)).resolves.toBe('rejected');
  });

  it('reports silent when nothing arrives within the bound', async () => {
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
    const pending = probeGet(URL);
    await vi.advanceTimersByTimeAsync(SOURCE_GET_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('silent');
  });
});

describe('isUnresolvableHost', () => {
  it('matches the reserved .invalid top-level domain, case and trailing dot aside', () => {
    expect(isUnresolvableHost('https://abc.onchfs.invalid/?fxhash=1')).toBe(true);
    expect(isUnresolvableHost('https://ABC.Eth.Onchfs.INVALID./x')).toBe(true);
    expect(isUnresolvableHost('http://invalid/')).toBe(true);
  });

  it('does not match an ordinary host, or .invalid outside the host', () => {
    expect(isUnresolvableHost('https://art.test/x.invalid')).toBe(false);
    expect(isUnresolvableHost('https://invalid.example.com/')).toBe(false);
    expect(isUnresolvableHost('not a url')).toBe(false);
  });
});
