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
    expect(requestInit).toEqual({ method: 'HEAD' });
  });
});
