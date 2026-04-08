import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from '../common/enums';
import { HashUtil } from '../common/utils/hash.util';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import { AccessTokenPayload } from './interfaces/jwt-payload.interface';
import { TokenService } from './services/token.service';

/**
 * Pure orchestration layer for authentication. All persistence concerns are
 * delegated to PrismaService and TokenService — this class only validates
 * credentials, builds the JWT payload and coordinates token issuance.
 *
 * Registration is intentionally NOT exposed: users are created exclusively
 * by the Users module under the `users:manage` permission.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPairDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await HashUtil.bcryptCompare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair({
      id: user.id,
      email: user.email,
      role: user.role.name as Role,
      permissions: user.role.permissions.map((rp) => rp.permission.name),
      isProtected: user.isProtected,
    });
  }

  async refresh(refreshToken: string): Promise<TokenPairDto> {
    let userId: string;
    try {
      userId = await this.tokenService.consumeRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer active');
    }

    return this.issueTokenPair({
      id: user.id,
      email: user.email,
      role: user.role.name as Role,
      permissions: user.role.permissions.map((rp) => rp.permission.name),
      isProtected: user.isProtected,
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async issueTokenPair(claims: {
    id: string;
    email: string;
    role: Role;
    permissions: string[];
    isProtected: boolean;
  }): Promise<TokenPairDto> {
    const payload: AccessTokenPayload = {
      sub: claims.id,
      email: claims.email,
      role: claims.role,
      permissions: claims.permissions,
      isProtected: claims.isProtected,
    };

    const accessToken = this.tokenService.signAccessToken(payload);
    const refreshToken = await this.tokenService.issueRefreshToken(claims.id);

    return { accessToken, refreshToken };
  }
}
