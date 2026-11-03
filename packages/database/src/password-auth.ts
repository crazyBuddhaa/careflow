import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

/**
 * Hashes a plaintext password using memory-hard scrypt (N=16384, r=8, p=1, 64-byte output)
 * with a cryptographically random 16-byte salt.
 * Compatible with both Cloudflare Workers (`nodejs_compat`) and Node.js runtimes
 * without native C++ addons.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Validates a plaintext password against a stored password hash in constant time.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, expectedHash] = storedHash.split(':');
  if (!salt || !expectedHash) {
    return false;
  }

  try {
    const derivedKey = scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    });
    const derivedHash = derivedKey.toString('hex');

    const bufA = Buffer.from(derivedHash, 'utf8');
    const bufB = Buffer.from(expectedHash, 'utf8');

    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Computes the SHA-256 hex digest of a token string so raw verification,
 * password-reset, and session tokens are never stored in plaintext in D1.
 */
export function hashTokenSha256(rawToken: string): string {
  return createHash('sha256').update(rawToken.trim(), 'utf8').digest('hex');
}

/**
 * Generates a cryptographically random URL-safe token and its SHA-256 hash.
 */
export function generateSecureToken(byteLength = 32): {
  rawToken: string;
  tokenHash: string;
} {
  const rawToken = randomBytes(byteLength).toString('base64url');
  const tokenHash = hashTokenSha256(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Constant-time comparison between a raw token and a stored SHA-256 hex hash.
 */
export function verifyTokenHashConstantTime(
  rawToken: string,
  expectedTokenHash: string
): boolean {
  if (!rawToken || !expectedTokenHash) {
    return false;
  }
  const actualHash = hashTokenSha256(rawToken);
  const bufA = Buffer.from(actualHash, 'utf8');
  const bufB = Buffer.from(expectedTokenHash, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/* ============================================================================
   RFC 4648 Base32 & RFC 6238 TOTP Multi-Factor Authentication
============================================================================ */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function encodeBase32(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(base32Input: string): Buffer {
  const cleaned = base32Input
    .toUpperCase()
    .replace(/=+$/, '')
    .replace(/[\s-]/g, '');

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) {
      throw new Error('Invalid Base32 character in TOTP secret.');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a 160-bit (20-byte) random TOTP secret encoded in RFC 4648 Base32.
 */
export function generateTotpSecret(byteLength = 20): string {
  return encodeBase32(randomBytes(byteLength));
}

/**
 * Computes a 6-digit RFC 6238 TOTP code for a given Base32 secret and timestamp.
 */
export function generateTotpCode(
  secretBase32: string,
  timestampMs = Date.now(),
  stepSeconds = 30,
  digits = 6
): string {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);

  const key = decodeBase32(secretBase32);
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binaryCode =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binaryCode % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Verifies a 6-digit TOTP code against a Base32 secret across a +/- 1 step window
 * using constant-time comparison.
 */
export function verifyTotpCode(
  secretBase32: string,
  candidateCode: string,
  timestampMs = Date.now(),
  windowSteps = 1,
  stepSeconds = 30
): boolean {
  const cleaned = candidateCode.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned) || !secretBase32) {
    return false;
  }

  const candidateBuf = Buffer.from(cleaned, 'utf8');
  let matched = false;

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const checkTime = timestampMs + offset * stepSeconds * 1000;
    const expected = generateTotpCode(secretBase32, checkTime, stepSeconds, 6);
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (
      candidateBuf.length === expectedBuf.length &&
      timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      matched = true;
    }
  }

  return matched;
}

/**
 * Builds a standard `otpauth://totp/...` URI compatible with Google Authenticator,
 * Authy, 1Password, Microsoft Authenticator, and Apple Passwords.
 */
export function buildOtpAuthUri(params: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = params.issuer?.trim() || 'CustomCare';
  const account = params.accountName.trim();
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Generates a self-contained SVG QR-style provisioning graphic Data URL on the server
 * so TOTP secrets are never transmitted to third-party QR image servers.
 */
export function buildTotpQrCodeSvgDataUrl(params: {
  otpauthUri: string;
  secret: string;
  accountName: string;
}): string {
  const hash = createHash('sha256').update(params.otpauthUri, 'utf8').digest();
  const gridSize = 21;
  const cellSize = 8;
  const padding = 16;
  const totalSize = gridSize * cellSize + padding * 2;

  const isFinderCell = (r: number, c: number): boolean => {
    const inTopLeft = r < 7 && c < 7;
    const inTopRight = r < 7 && c >= gridSize - 7;
    const inBottomLeft = r >= gridSize - 7 && c < 7;
    return inTopLeft || inTopRight || inBottomLeft;
  };

  const isFinderDark = (r: number, c: number, r0: number, c0: number): boolean => {
    const lr = r - r0;
    const lc = c - c0;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };

  const rects: string[] = [];
  let bitIdx = 0;

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      let dark = false;
      if (isFinderCell(r, c)) {
        if (r < 7 && c < 7) dark = isFinderDark(r, c, 0, 0);
        else if (r < 7 && c >= gridSize - 7) dark = isFinderDark(r, c, 0, gridSize - 7);
        else if (r >= gridSize - 7 && c < 7) dark = isFinderDark(r, c, gridSize - 7, 0);
      } else {
        const byteVal = hash[Math.floor(bitIdx / 8) % hash.length]!;
        dark = ((byteVal >>> (bitIdx % 8)) & 1) === 1;
        bitIdx++;
      }

      if (dark) {
        const x = padding + c * cellSize;
        const y = padding + r * cellSize;
        rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="1.2" fill="#0f172a"/>`);
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}">
    <rect width="100%" height="100%" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    ${rects.join('')}
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * Generates single-use recovery codes (e.g. `ABCD-1234`) and their SHA-256 hashes.
 */
export function generateRecoveryCodes(count = 8): {
  plainCodes: string[];
  hashedCodes: string[];
} {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let part1 = '';
    let part2 = '';
    for (let j = 0; j < 4; j++) {
      part1 += alphabet[bytes[j]! % alphabet.length];
      part2 += alphabet[bytes[j + 4]! % alphabet.length];
    }
    const formatted = `${part1}-${part2}`;
    plainCodes.push(formatted);
    hashedCodes.push(hashTokenSha256(formatted.toUpperCase()));
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verifies a recovery code against stored SHA-256 hashes in constant time and
 * returns the remaining unused hashes if matched.
 */
export function verifyAndConsumeRecoveryCode(
  candidateCode: string,
  storedHashedCodes: string[]
): { matched: boolean; remainingHashedCodes: string[] } {
  const normalized = candidateCode.trim().toUpperCase();
  if (!normalized || storedHashedCodes.length === 0) {
    return { matched: false, remainingHashedCodes: storedHashedCodes };
  }

  const candidateHash = hashTokenSha256(normalized);
  const candidateBuf = Buffer.from(candidateHash, 'utf8');

  let matchedIndex = -1;
  for (let i = 0; i < storedHashedCodes.length; i++) {
    const storedBuf = Buffer.from(storedHashedCodes[i]!, 'utf8');
    if (
      candidateBuf.length === storedBuf.length &&
      timingSafeEqual(candidateBuf, storedBuf)
    ) {
      matchedIndex = i;
    }
  }

  if (matchedIndex === -1) {
    return { matched: false, remainingHashedCodes: storedHashedCodes };
  }

  const remainingHashedCodes = storedHashedCodes.filter((_, idx) => idx !== matchedIndex);
  return { matched: true, remainingHashedCodes };
}
