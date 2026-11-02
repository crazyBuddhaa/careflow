import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hashes a plaintext password using standard scrypt with a unique random salt.
 * Produces a format: `<salt_hex>:<hash_hex>`.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Validates a plaintext password against a stored scrypt hash in constant time.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, expectedHash] = storedHash.split(':');
  if (!salt || !expectedHash) {
    return false;
  }

  const derivedKey = scryptSync(password, salt, 64);
  const derivedHash = derivedKey.toString('hex');

  const bufA = Buffer.from(derivedHash, 'utf8');
  const bufB = Buffer.from(expectedHash, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
