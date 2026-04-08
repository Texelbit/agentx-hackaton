import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvConfig } from '../../config/env.config';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

/**
 * Name of the cookie that mirrors the access token. Set by `AuthController`
 * on login and read by the cookie extractor below. Allows Swagger UI's
 * "Try it out" to authenticate without manually pasting the bearer token.
 */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * Custom JWT extractor: tries `Authorization: Bearer <token>` first (the
 * canonical path used by both frontends), then falls back to the cookie
 * (used by Swagger UI and any browser client we choose to integrate).
 */
function jwtFromRequest(req: Request): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;

  const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    ACCESS_TOKEN_COOKIE
  ];
  return fromCookie ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(env: EnvConfig) {
    super({
      jwtFromRequest,
      ignoreExpiration: false,
      secretOrKey: env.jwtPublicKey,
      algorithms: ['RS256'],
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Malformed access token');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions ?? [],
      isProtected: payload.isProtected ?? false,
    };
  }
}
