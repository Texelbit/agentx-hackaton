import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { ACCESS_TOKEN_COOKIE } from '../auth/strategies/jwt.strategy';
import { EnvConfig } from '../config/env.config';

/**
 * Gate Swagger UI behind a real login.
 *
 * Reads the `access_token` cookie set by `AuthController.login`. If the
 * cookie is missing or invalid, serves a tiny inline login page that POSTs
 * to `/auth/login` (which then sets the cookie via the same controller).
 *
 * On success the page reloads and the user lands inside Swagger UI with the
 * cookie attached — meaning every "Try it out" call is automatically
 * authenticated as the logged-in user.
 *
 * Requires `cookie-parser` middleware to have run upstream (wired in `main.ts`).
 */
@Injectable()
export class SwaggerAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly env: EnvConfig,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Allow internal Swagger UI assets to pass through once authenticated
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const token = cookies?.[ACCESS_TOKEN_COOKIE];

    if (token && this.isValidToken(token)) {
      next();
      return;
    }

    // Not authenticated — serve the inline login page
    res.status(401).type('html').send(this.renderLoginPage());
  }

  private isValidToken(token: string): boolean {
    try {
      this.jwt.verify<AccessTokenPayload>(token, {
        publicKey: this.env.jwtPublicKey,
        algorithms: ['RS256'],
      });
      return true;
    } catch {
      return false;
    }
  }

  private renderLoginPage(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SRE Agent — Swagger Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: white;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    h1 { margin: 0 0 4px; font-size: 22px; color: #0f172a; }
    p.subtitle { margin: 0 0 24px; font-size: 14px; color: #64748b; }
    label { display: block; font-size: 13px; font-weight: 500; color: #334155; margin-bottom: 6px; }
    input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 16px;
      outline: none;
    }
    input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15); }
    button {
      width: 100%;
      padding: 11px;
      background: #4f46e5;
      color: white;
      border: 0;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #4338ca; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .error {
      background: #fef2f2;
      color: #b91c1c;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 12px;
      display: none;
    }
    .hint {
      margin-top: 16px;
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔒 Swagger UI</h1>
    <p class="subtitle">Sign in to access the API documentation.</p>
    <div id="error" class="error"></div>
    <form id="login-form">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="username" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button id="submit" type="submit">Sign in</button>
    </form>
    <p class="hint">Cookie-based session — JWT stored as httpOnly.</p>
  </div>

  <script>
    const form = document.getElementById('login-form');
    const errorBox = document.getElementById('error');
    const submitBtn = document.getElementById('submit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';

      try {
        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Invalid credentials');
        }

        // Cookie is set by the backend — reload to enter Swagger UI
        window.location.reload();
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
      }
    });
  </script>
</body>
</html>`;
  }
}
