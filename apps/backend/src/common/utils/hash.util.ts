import * as bcrypt from 'bcrypt';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

/**
 * Centralized hashing/HMAC helpers. Other modules MUST go through this util
 * instead of importing `bcrypt` or `crypto` directly, so the algorithm and
 * cost factor can be tuned in a single place.
 */
export class HashUtil {
  private static readonly BCRYPT_ROUNDS = 12;

  static async bcryptHash(plain: string): Promise<string> {
    return bcrypt.hash(plain, HashUtil.BCRYPT_ROUNDS);
  }

  static async bcryptCompare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /** SHA-256 hex digest — used to fingerprint refresh tokens before storing. */
  static sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Computes the HMAC-SHA256 hex digest used to verify webhook signatures. */
  static hmacSha256(secret: string, payload: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Constant-time comparison of two equally-sized strings.
   * Both arguments must be non-empty; returns false on length mismatch.
   */
  static safeEqual(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
