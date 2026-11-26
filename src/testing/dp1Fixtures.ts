/**
 * Builders for the DP-1 documents tests carry. A document a test means to be
 * valid goes through `dp1Document`, so it passes the pinned DP-1 1.1.0
 * schemas (a signature, uuid ids, enum licences); a test that needs an invalid
 * shape writes it inline and says why.
 */
import type { DP1Call } from '@/models/dp1.model';

/**
 * A stable UUID for a readable fixture name, so tests can keep naming works
 * `A` or `slow` while the document carries the uuid the schema requires.
 */
export function fixtureId(name: string): string {
  const hex = [0, 1, 2, 3]
    .map(seed => {
      let hash = 0x811c9dc5 ^ seed;
      for (const char of name) {
        hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    })
    .join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Schema-shaped, not cryptographically real: the player does not verify
 * signatures, and no test may rely on this one verifying.
 */
export const fixtureSignature = {
  alg: 'ed25519',
  kid: 'did:key:z6MkFixture',
  ts: '2026-01-01T00:00:00Z',
  payload_hash: `sha256:${'0'.repeat(64)}`,
  role: 'curator',
  sig: 'Zml4dHVyZQ',
};

/** A signed playlist; `fields` override or extend the minimal document. */
export function dp1Document(
  fields: Partial<DP1Call> & Pick<DP1Call, 'items'>
): DP1Call {
  return {
    dpVersion: '1.1.0',
    title: 'Fixture',
    signatures: [{ ...fixtureSignature }],
    ...fields,
  } as DP1Call;
}

/** `fixtureId` for a list, for asserting which works a playlist holds. */
export function fixtureIds(...names: string[]): string[] {
  return names.map(fixtureId);
}
