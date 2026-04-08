import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacGuard } from './guards/rbac.guard';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Auth module wires JWT/Passport, exposes the AuthController and registers
 * `JwtAuthGuard` + `RbacGuard` as **global** guards via `APP_GUARD`. This
 * means every controller is protected by default — opt out with `@Public()`.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
