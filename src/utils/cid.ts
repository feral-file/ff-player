const CID_BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CID_BASE36_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const CID_BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** Big-number base conversion for base36/base58 (leading zero symbols are leading zero bytes). */
function decodeCidBase(input: string, alphabet: string): number[] | null {
  let number = BigInt(0);
  const radix = BigInt(alphabet.length);
  for (const char of input) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) {
      return null;
    }
    number = number * radix + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > BigInt(0)) {
    bytes.push(Number(number & BigInt(0xff)));
    number >>= BigInt(8);
  }
  let zeros = 0;
  for (const char of input) {
    if (char !== alphabet[0]) {
      break;
    }
    zeros++;
  }
  return [...Array<number>(zeros).fill(0), ...bytes.reverse()];
}

/** Lowercase hex, as CIDv1's `f` multibase prefix uses. */
function decodeCidBase16(input: string): number[] | null {
  if (input.length % 2 !== 0 || !/^[0-9a-f]*$/.test(input)) {
    return null;
  }
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 2) {
    bytes.push(parseInt(input.slice(i, i + 2), 16));
  }
  return bytes;
}

/** Unpadded lowercase RFC 4648 base32, as CIDv1's `b` multibase prefix uses. */
function decodeCidBase32(input: string): number[] | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of input) {
    const digit = CID_BASE32_ALPHABET.indexOf(char);
    if (digit < 0) {
      return null;
    }
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  // Leftover bits must be zero padding smaller than one symbol.
  return bits < 5 && buffer === 0 ? bytes : null;
}

/** Reads one unsigned LEB128 varint (the CID multihash's code/length fields) starting at `offset`. */
function readCidVarint(
  bytes: number[],
  offset: number
): { value: number; next: number } | null {
  let value = 0;
  for (let i = 0; i < 4 && offset + i < bytes.length; i++) {
    const byte = bytes[offset + i];
    value |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) {
      // A zero final group after earlier groups is a non-minimal encoding,
      // which the CID spec requires decoders to reject.
      if (i > 0 && byte === 0) {
        return null;
      }
      return { value, next: offset + i + 1 };
    }
  }
  return null;
}

/** Whether `bytes` from `offset` is a well-formed multihash: code varint, length varint, then a digest of exactly that length. */
function isCidMultihash(bytes: number[], offset: number): boolean {
  const code = readCidVarint(bytes, offset);
  if (!code) {
    return false;
  }
  const length = readCidVarint(bytes, code.next);
  return !!length && bytes.length - length.next === length.value;
}

/**
 * Structural CID validation, mirroring ff-app's `_isCid` exactly
 * (feral-file/feral-file#3583): decode the multibase string, then verify the
 * binary layout rather than guessing from length, because digest size varies
 * by hash (a CIDv1 with a 20-byte SHA-1 digest is shorter than the common
 * 32-byte SHA-256 one). CIDv0 is a bare base58 multihash; CIDv1 is
 * `version=1`, codec varint, multihash, where the multihash is code varint,
 * length varint, then a digest of exactly that length.
 */
export function isCid(value: string): boolean {
  if (value.length === 46 && value.startsWith('Qm')) {
    const bytes = decodeCidBase(value, CID_BASE58_ALPHABET);
    return bytes !== null && isCidMultihash(bytes, 0);
  }
  if (value.length < 2) {
    return false;
  }
  const body = value.slice(1);
  let bytes: number[] | null;
  switch (value[0]) {
    case 'b':
      bytes = decodeCidBase32(body);
      break;
    case 'f':
      bytes = decodeCidBase16(body);
      break;
    case 'k':
      bytes = decodeCidBase(body, CID_BASE36_ALPHABET);
      break;
    case 'z':
      bytes = decodeCidBase(body, CID_BASE58_ALPHABET);
      break;
    default:
      return false;
  }
  if (!bytes || bytes.length === 0 || bytes[0] !== 1) {
    return false;
  }
  const codec = readCidVarint(bytes, 1);
  return !!codec && isCidMultihash(bytes, codec.next);
}
