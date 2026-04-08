import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { HashUtil } from '../../common/utils/hash.util';
import { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

/**
 * Owns the lifecycle of access and refresh tokens.
 *
 *  - Access tokens are signed JWTs (RS256) — never persisted.
 *  - Refresh tokens are opaque UUID v4 strings. Only their SHA-256 fingerprint
 *    is stored in `refresh_tokens` so a DB leak does not expose live tokens.
 *
 * Rotation policy: every successful refresh revokes the consumed token and
 * issues a brand-new pair, preventing replay attacks.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly env: EnvConfig,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      privateKey: this.env.jwtPrivateKey,
      algorithm: 'RS256',
      expiresIn: this.env.jwtAccessExpiry,
    });
  }

  /**
   * Issues a new opaque refresh token and persists its fingerprint.
   * Returns the plaintext token to the caller — it is shown to the user once
   * and never recoverable from the DB afterwards.
   */
  async issueRefreshToken(userId: string): Promise<string> {
    const plain = uuidv4();
    const tokenHash = HashUtil.sha256(plain);
    const expiresAt = this.computeRefreshExpiry();

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return plain;
  }

  /**
   * Validates a refresh token, revokes it and returns the owning user ID.
   * Throws when the token is missing, expired or already revoked.
   */
  async consumeRefreshToken(plain: string): Promise<string> {
    const tokenHash = HashUtil.sha256(plain);
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new Error('Refresh token is invalid or expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revoked: true, revokedAt: new Date() },
    });

    return record.userId;
  }

  async revokeRefreshToken(plain: string): Promise<void> {
    const tokenHash = HashUtil.sha256(plain);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private computeRefreshExpiry(): Date {
    const expiry = this.env.jwtRefreshExpiry;
    const days = this.parseDays(expiry);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private parseDays(expiry: string): number {
    const match = expiry.match(/^(\d+)d$/);
    if (!match) {
      throw new Error(
        `Invalid JWT_REFRESH_EXPIRY format "${expiry}" — expected e.g. "7d"`,
      );
    }
    return parseInt(match[1], 10);
  }
}
