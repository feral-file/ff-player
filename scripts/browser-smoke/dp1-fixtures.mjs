/**
 * Plain-JS twin of `src/testing/dp1Fixtures.ts` (these scripts cannot import
 * TypeScript): the smoke casts must pass the pinned DP-1 1.1.0 schemas.
 */

/** A stable UUID for a readable fixture name. */
export function fixtureId(name) {
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

/** A signed playlist. The signature is schema-shaped, not verifiable. */
export function dp1Document(fields) {
  return {
    dpVersion: '1.1.0',
    title: 'Fixture',
    signatures: [
      {
        alg: 'ed25519',
        kid: 'did:key:z6MkFixture',
        ts: '2026-01-01T00:00:00Z',
        payload_hash: `sha256:${'0'.repeat(64)}`,
        role: 'curator',
        sig: 'Zml4dHVyZQ',
      },
    ],
    ...fields,
  };
}
