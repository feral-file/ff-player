import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ipfsDirectoryPresentationURL,
  needsIPFSDirectoryProbe,
  verifiedIPFSDirectoryPresentationURL,
} from './ipfsDirectory';

const source =
  'https://gateway.example/ipfs/QmArtwork?fxhash=ooSeed&a=%20&a=+#section';

afterEach(() => vi.restoreAllMocks());

/** Model the browser's final response after a gateway slash redirect. */
function response(url: string, type = 'text/html') {
  return {
    url,
    ok: true,
    redirected: true,
    headers: new Headers({ 'Content-Type': type }),
  } as Response;
}

describe('IPFS directory presentation', () => {
  it.each([
    ['text/html', true],
    ['text/plain', false],
  ])(
    'requires a direct HTML response for the corrected URL: %s',
    async (mime, works) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          headers: { 'Content-Type': mime },
        })
      );
      const result = await verifiedIPFSDirectoryPresentationURL(
        source,
        response('https://gateway.example/ipfs/QmArtwork/')
      );
      expect(result).toBe(works ? source.replace('?', '/?') : source);
    }
  );

  it('retains the source if the corrected URL redirects again', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response('https://gateway.example/ipfs/QmArtwork/')
    );
    expect(
      await verifiedIPFSDirectoryPresentationURL(
        source,
        response('https://gateway.example/ipfs/QmArtwork/')
      )
    ).toBe(source);
  });

  it('retains the exact original query and fragment after a proven slash redirect', () => {
    expect(
      ipfsDirectoryPresentationURL(
        source,
        response('https://gateway.example/ipfs/QmArtwork/')
      )
    ).toBe(
      'https://gateway.example/ipfs/QmArtwork/?fxhash=ooSeed&a=%20&a=+#section'
    );
  });

  it.each([
    ['https://other.example/ipfs/QmArtwork/', 'text/html'],
    ['https://gateway.example/ipfs/QmOther/', 'text/html'],
    ['https://gateway.example/ipfs/QmArtwork/index.html', 'text/html'],
    ['https://gateway.example/ipfs/QmArtwork/', 'image/png'],
    ['https://gateway.example/ipfs/QmArtwork/', 'text/plain; charset=utf-8'],
  ])('does not rewrite unrelated responses: %s (%s)', (url, type) => {
    expect(ipfsDirectoryPresentationURL(source, response(url, type))).toBe(
      source
    );
  });

  it('keeps a file CID and a replayed offline response at the original source', () => {
    const reply = response(source);
    expect(ipfsDirectoryPresentationURL(source, reply)).toBe(source);
    Object.defineProperty(reply, 'redirected', { value: false });
    expect(ipfsDirectoryPresentationURL(source, reply)).toBe(source);
  });

  it.each([
    'https://gateway.example/ipfs/QmArtwork/?fxhash=ooSeed',
    'https://gateway.example/ipfs/QmArtwork',
    'https://example.com/work?fxhash=ooSeed',
    'data:text/html,hello?fxhash=ooSeed',
  ])(
    'does not probe a source without a possible query-losing IPFS slash redirect: %s',
    url => {
      expect(needsIPFSDirectoryProbe(url)).toBe(false);
    }
  );
});
