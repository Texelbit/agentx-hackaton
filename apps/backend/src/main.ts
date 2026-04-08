import { Logger, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Request, Response, NextFunction } from 'express';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.config';
import { SwaggerAuthMiddleware } from './swagger/swagger-auth.middleware';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    // Required by `WebhookHmacGuard` — preserves the unparsed body buffer
    // so HMAC signatures can be recomputed exactly as the sender produced.
    rawBody: true,
  });

  const env = app.get(EnvConfig);

  // ── Global middleware ────────────────────────────────────────────────
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // ── Swagger UI (gated by SwaggerAuthMiddleware) ──────────────────────
  //
  // The middleware checks the `access_token` cookie and serves an inline
  // login page if missing/invalid. After login the cookie is set by
  // AuthController, the page reloads, and the user lands inside Swagger UI
  // with `withCredentials: true` so every "Try it out" call sends the cookie.
  const jwtService = app.get(JwtService);
  const swaggerAuth = new SwaggerAuthMiddleware(jwtService, env);
  app.use('/api/docs', (req: Request, res: Response, next: NextFunction) => {
    swaggerAuth.use(req, res, next);
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SRE Incident Response Agent API')
    .setDescription(
      'AgentX Hackathon 2026 — Full API reference. ' +
        'Authenticated via httpOnly cookie set on POST /auth/login.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      // Sends cookies on every "Try it out" call so the existing session works
      withCredentials: true,
      persistAuthorization: true,
    },
    customSiteTitle: 'SRE Agent — API Docs',
  });

  await app.listen(env.port);
  logger.log(`Backend listening on port ${env.port}`);
  logger.log(`Swagger UI available at http://localhost:${env.port}/api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
