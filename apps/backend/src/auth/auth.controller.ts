import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { EnvConfig } from '../config/env.config';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { TokenPairDto } from './dto/token-pair.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ACCESS_TOKEN_COOKIE } from './strategies/jwt.strategy';

const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000; // mirrors JWT_ACCESS_EXPIRY default

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly env: EnvConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login with email and password. Also sets an httpOnly access_token cookie so Swagger UI can authenticate via Try-it-out.',
  })
  @ApiResponse({ status: 200, type: TokenPairDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPairDto> {
    const tokens = await this.authService.login(dto);
    this.setAccessCookie(res, tokens.accessToken);
    return tokens;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new pair' })
  @ApiResponse({ status: 200, type: TokenPairDto })
  async refresh(
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPairDto> {
    const tokens = await this.authService.refresh(dto.refreshToken);
    this.setAccessCookie(res, tokens.accessToken);
    return tokens;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the active refresh token and clear the access cookie' })
  @ApiResponse({ status: 204 })
  async logout(
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(dto.refreshToken);
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  }

  // ── helpers ────────────────────────────────────────────────────────

  private setAccessCookie(res: Response, accessToken: string): void {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.isProduction,
      maxAge: ACCESS_COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }
}
