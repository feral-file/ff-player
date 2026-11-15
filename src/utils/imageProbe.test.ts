/**
 * LoadsAsImage answers "is this source an image?" with the browser's own
 * decoder, bounded in time, and answers false where nothing can be proven.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadsAsImage } from './imageProbe';

/**
 *
 */
/** Replaces the global Image with one whose decode() is the given function, and returns the instances created. */
function stubImage(decode: (() => Promise<void>) | undefined) {
  const created: { src: string }[] = [];
  /**
   *
   */
  class FakeImage {
    src = '';
    decode = decode;
    constructor() {
      created.push(this);
    }
  }
  vi.stubGlobal('Image', FakeImage);
  return created;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('loadsAsImage', () => {
  it('is true when the browser decodes the source', async () => {
    stubImage(() => Promise.resolve());
    await expect(loadsAsImage('https://example.com/cid')).resolves.toBe(true);
  });

  it('is false when the source fails to load or is not an image', async () => {
    stubImage(() => Promise.reject(new Error('EncodingError')));
    await expect(loadsAsImage('https://example.com/cid')).resolves.toBe(false);
  });

  it('is false at once where images cannot be decoded', async () => {
    stubImage(undefined);
    await expect(loadsAsImage('https://example.com/cid')).resolves.toBe(false);
  });

  it('is false when the decode outlasts the bound, and drops the request', async () => {
    vi.useFakeTimers();
    const created = stubImage(() => new Promise<void>(() => undefined));
    const result = loadsAsImage('https://example.com/cid', 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe(false);
    expect(created[0].src).toBe('');
  });
});
