import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/** Encrypts small secrets (like Discord access tokens) before they're stored. */
export function sealer(secret: string) {
  const key = createHash('sha256').update(`sparko:${secret}`).digest();
  return {
    seal(plain: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([
        cipher.update(plain, 'utf8'),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString(
        'base64url',
      );
    },
    open(sealed: string) {
      const raw = Buffer.from(sealed, 'base64url');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        raw.subarray(0, 12),
      );
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

export const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('base64url');
