import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContentTypeFromURL } from './helper';

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

  it('uses the server fallback base to infer MIME type for a relative URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        headers: { 'Content-Type': 'model/gltf-binary' },
        status: 200,
      })
    );

    await expect(getContentTypeFromURL('artwork/model.glb')).resolves.toBe(
      'model/gltf-binary'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^artwork\/model\.glb\?v=\d+&x-request=xhr$/),
      { method: 'HEAD' }
    );
  });
});
