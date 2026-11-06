import { describe, expect, it } from 'vitest';
import { isCid } from './cid';

/**
 * Run-reviewer, PR #328 inner loop: `isCid`'s only prior coverage was
 * indirect, through `helper.test.ts`'s `getContentTypeFromURL` tests, which
 * only ever exercised the `b` (base32) and `Qm` (CIDv0 base58) shapes. The
 * `f` (base16), `k` (base36), and `z` (base58btc) multibase prefixes, and
 * the hand-written malformed-input rejection paths, had no test exercising
 * them at all. These tests build real CIDv1 byte layouts (version, codec
 * varint, multihash code+length+digest) and encode them with the inverse of
 * each decoder this file implements, so a regression in any one alphabet or
 * boundary check fails here directly instead of silently misclassifying a
 * source in `isContentAddressed`.
 */

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE36_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** Inverse of `decodeCidBase`: big-number base encoding, leading zero bytes become leading zero symbols. */
function encodeBase(bytes: number[], alphabet: string): string {
  let number = BigInt(0);
  for (const byte of bytes) {
    number = number * BigInt(256) + BigInt(byte);
  }
  let out = '';
  while (number > BigInt(0)) {
    const digit = Number(number % BigInt(alphabet.length));
    out = alphabet[digit] + out;
    number /= BigInt(alphabet.length);
  }
  let zeros = 0;
  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }
    zeros++;
  }
  return alphabet[0].repeat(zeros) + (out === '' ? alphabet[0] : out);
}

/** Inverse of `decodeCidBase16`: lowercase hex. */
function encodeBase16(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Inverse of `decodeCidBase32`: unpadded lowercase RFC 4648. */
function encodeBase32(bytes: number[]): string {
  let buffer = 0;
  let bits = 0;
  let out = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(buffer >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  }
  return out;
}

/** One LEB128 varint byte sequence for a value small enough to fit one or two groups. */
function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining > 0);
  return bytes;
}

/** A CIDv1 byte layout: version=1, codec varint, multihash (code varint, length varint, digest). */
function cidV1Bytes(codec: number, hashCode: number, digest: number[]): number[] {
  return [
    1,
    ...encodeVarint(codec),
    ...encodeVarint(hashCode),
    ...encodeVarint(digest.length),
    ...digest,
  ];
}

const RAW_CODEC = 0x55;
const SHA2_256 = 0x12;
const SHA1 = 0x11;
const DIGEST_32 = Array.from({ length: 32 }, (_, i) => (i * 7 + 1) % 256);
const DIGEST_20 = Array.from({ length: 20 }, (_, i) => (i * 11 + 3) % 256);

describe('isCid — CIDv1 multibase prefixes', () => {
  it('recognizes a base16 (f-prefixed) CIDv1', () => {
    const bytes = cidV1Bytes(RAW_CODEC, SHA2_256, DIGEST_32);
    expect(isCid(`f${encodeBase16(bytes)}`)).toBe(true);
  });

  it('recognizes a base36 (k-prefixed) CIDv1', () => {
    const bytes = cidV1Bytes(RAW_CODEC, SHA2_256, DIGEST_32);
    expect(isCid(`k${encodeBase(bytes, BASE36_ALPHABET)}`)).toBe(true);
  });

  it('recognizes a base58btc (z-prefixed) CIDv1', () => {
    const bytes = cidV1Bytes(RAW_CODEC, SHA2_256, DIGEST_32);
    expect(isCid(`z${encodeBase(bytes, BASE58_ALPHABET)}`)).toBe(true);
  });

  it('recognizes a base32 (b-prefixed) CIDv1 with a shorter SHA-1 digest', () => {
    const bytes = cidV1Bytes(RAW_CODEC, SHA1, DIGEST_20);
    expect(isCid(`b${encodeBase32(bytes)}`)).toBe(true);
  });

  it('recognizes a CIDv0 (bare base58, Qm-prefixed) multihash', () => {
    // CIDv0 has no explicit version/codec byte — it is a bare multihash
    // (code, length, digest) encoded as base58, which for a sha2-256
    // digest always produces a 46-character string starting with "Qm".
    const bytes = [SHA2_256, 32, ...DIGEST_32];
    const encoded = encodeBase(bytes, BASE58_ALPHABET);
    expect(encoded.startsWith('Qm')).toBe(true);
    expect(encoded.length).toBe(46);
    expect(isCid(encoded)).toBe(true);
  });
});

describe('isCid — malformed input rejection', () => {
  it('rejects a digest shorter than its declared length', () => {
    const bytes = cidV1Bytes(RAW_CODEC, SHA2_256, DIGEST_32).slice(0, -1);
    expect(isCid(`f${encodeBase16(bytes)}`)).toBe(false);
  });

  it('rejects a digest longer than its declared length', () => {
    const bytes = [...cidV1Bytes(RAW_CODEC, SHA2_256, DIGEST_32), 0xff];
    expect(isCid(`f${encodeBase16(bytes)}`)).toBe(false);
  });

  it('rejects a non-minimal (overlong) varint encoding', () => {
    // A trailing zero continuation byte after a value that already fit in
    // the previous byte is non-minimal and must be rejected, per the CID
    // spec's LEB128 requirement.
    const bytes = [1, RAW_CODEC | 0x80, 0x00, SHA2_256, 32, ...DIGEST_32];
    expect(isCid(`f${encodeBase16(bytes)}`)).toBe(false);
  });

  it('rejects an invalid multibase prefix character', () => {
    expect(isCid('xnotarealprefix')).toBe(false);
  });

  it('rejects a string with an invalid character for its claimed base16 alphabet', () => {
    expect(isCid('fzz')).toBe(false);
  });

  it('rejects a string too short to carry a multibase prefix and body', () => {
    expect(isCid('f')).toBe(false);
    expect(isCid('')).toBe(false);
  });

  it('rejects a 46-character string that starts with "Qm" but is not valid base58', () => {
    expect(isCid(`Qm${'0'.repeat(44)}`)).toBe(false);
  });
});
