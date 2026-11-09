import { getContentTypeFromURL } from './helper';

/**
 * Only a slashless HTTP IPFS path with an artwork query can lose parameters
 * in a directory redirect. File CIDs remain candidates until HEAD proves
 * otherwise; never append a slash based on the CID or MIME type alone.
 */
export function needsIPFSDirectoryProbe(source: string): boolean {
  try {
    const url = new URL(source);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      /^\/ipfs\/[^/]+/.test(url.pathname) &&
      !url.pathname.endsWith('/') &&
      url.search !== ''
    );
  } catch {
    return false;
  }
}

/**
 * Carry the original query and fragment to a proven same-origin IPFS slash
 * redirect. Use this only for the transient navigation URL: the playlist,
 * token identity, and source key remain unchanged. This is only a candidate:
 * cached redirect chains may omit its query-preserving destination. Confirm
 * that destination with verifiedIPFSDirectoryPresentationURL before use.
 * Other hosts, paths, and non-HTML responses are never rewritten.
 */
export function ipfsDirectoryPresentationURL(
  source: string,
  response: Response
): string {
  if (
    !needsIPFSDirectoryProbe(source) ||
    !response.ok ||
    !response.redirected
  ) {
    return source;
  }
  const mime = response.headers
    .get('Content-Type')
    ?.split(';')[0]
    .trim()
    .toLowerCase();
  if (mime !== 'text/html' && mime !== 'application/xhtml+xml') {
    return source;
  }
  try {
    const original = new URL(source);
    const resolved = new URL(response.url);
    if (
      resolved.origin !== original.origin ||
      resolved.pathname !== original.pathname + '/'
    ) {
      return source;
    }
    // Mutating pathname alone keeps query bytes, duplicate keys, and fragment.
    original.pathname += '/';
    return original.href;
  } catch {
    return source;
  }
}
/**
 * Confirm the corrected document exists before navigating to it. Offline
 * replay can reproduce the original redirect while lacking this exact URL;
 * its fail-closed HEAD miss must retain the original playable resource chain.
 * A second bounded HEAD is paid only for a proven HTML directory redirect.
 */
export async function verifiedIPFSDirectoryPresentationURL(
  source: string,
  response: Response
): Promise<string> {
  const candidate = ipfsDirectoryPresentationURL(source, response);
  if (candidate === source) {
    return source;
  }
  const result = { confirmed: false };
  try {
    await getContentTypeFromURL(candidate, reply => {
      const mime = reply.headers
        .get('Content-Type')
        ?.split(';')[0]
        .trim()
        .toLowerCase();
      result.confirmed =
        !reply.redirected &&
        (mime === 'text/html' || mime === 'application/xhtml+xml');
    });
  } catch {
    // This is optional navigation repair, never a new artwork-failure signal.
  }
  return result.confirmed ? candidate : source;
}
