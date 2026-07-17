import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContentTypeFromURL } from './helper';

describe('getContentTypeFromURL', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sniffs extensionless GLB assets when HEAD fails', async () => {
    const networkError = new Error('network down');
    const glbBytes = new Uint8Array([
      0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00,
    ]);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(vi.fn());

    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return Promise.reject(networkError);
      }

      return Promise.resolve(
        new Response(glbBytes, {
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          status: 206,
        })
      );
    });

    await expect(
      getContentTypeFromURL('https://example.com/ipfs/bafy-test-cid')
    ).resolves.toBe('model/gltf-binary');

    expect(consoleLog).toHaveBeenCalledWith(
      '[ContentType] Failed to get content-type from HEAD request',
      expect.stringContaining('"message":"network down"')
    );
    expect(consoleLog).toHaveBeenCalledWith(
      '[ContentType] Sniffed Content-Type:',
      'model/gltf-binary'
    );
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
