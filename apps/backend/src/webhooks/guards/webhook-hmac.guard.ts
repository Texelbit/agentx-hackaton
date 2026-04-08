import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { HashUtil } from '../../common/utils/hash.util';
import { EnvConfig } from '../../config/env.config';

/**
 * HMAC-SHA256 signature verifier for GitHub and Jira webhooks.
 *
 * Requires the request body to have been preserved as `request.rawBody` —
 * `main.ts` enables this via `NestFactory.create(..., { rawBody: true })`.
 *
 * GitHub: header `x-hub-signature-256: sha256=<hex>`
 * Jira:   header `x-hub-signature: sha256=<hex>` (Atlassian also accepts
 *         `x-atlassian-webhook-identifier` — we stick to the standard
 *         signature header configured on the webhook).
 */
@Injectable()
export class WebhookHmacGuard implements CanActivate {
  private readonly logger = new Logger(WebhookHmacGuard.name);

  constructor(private readonly env: EnvConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();

    const path = request.path ?? request.url ?? '';
    const isGithub = path.includes('github');
    const secret = isGithub
      ? this.env.githubWebhookSecret
      : this.env.jiraWebhookSecret;

    const headerName = isGithub ? 'x-hub-signature-256' : 'x-hub-signature';
    const signatureHeader = request.headers[headerName];
    if (!signatureHeader || typeof signatureHeader !== 'string') {
      this.logger.warn(`Missing ${headerName} header`);
      throw new UnauthorizedException('Missing webhook signature');
    }

    const rawBody =
      request.rawBody?.toString('utf8') ??
      (request.body ? JSON.stringify(request.body) : '');

    const expected = `sha256=${HashUtil.hmacSha256(secret, rawBody)}`;

    if (!HashUtil.safeEqual(signatureHeader, expected)) {
      this.logger.warn(`Invalid signature on ${path}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
