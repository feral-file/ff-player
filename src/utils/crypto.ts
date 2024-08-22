import crypto from 'crypto';

export function hashStringToSHA256(input: string) {
  try {
    return crypto.createHash('sha256').update(input).digest('hex');
  } catch (error) {
    console.error(error);
    return '';
  }
}
