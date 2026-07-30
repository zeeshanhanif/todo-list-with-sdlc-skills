import {
  Inject,
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_ERROR_CODES } from '@todo/shared';
import { APP_CONFIG, type AppConfig } from '../../infra/config';
import { RateLimitRepository } from './rate-limit.repository';

/**
 * Per-IP fixed-window rate limiter for the auth endpoints (FR-AUTH-018,
 * NFR-SEC-006). Applied to sign-in and retrofitted onto register / verify /
 * verify-resend. Over the configured window max → `429 rate_limited` with
 * `retryAfterSeconds`. Thresholds come from the boot-time config (DEF-008);
 * they are fixed for the process's life, which is what env vars already were.
 * Cross-cutting (`common/rate-limit`).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly buckets: RateLimitRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cfg = this.config;
    const windowMs = cfg.authRateLimitWindowSeconds * 1000;
    const req = ctx.switchToHttp().getRequest<Request>();

    const ip = clientIp(req);
    // Auth endpoints carry no path params, so req.path is a stable route key.
    const route = `${req.method} ${req.path}`;
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

    const count = await this.buckets.hitAndCount(ip, route, windowStart);
    if (count > cfg.authRateLimitMax) {
      const retryAfterSeconds = Math.ceil(
        (windowStart.getTime() + windowMs - now) / 1000,
      );
      throw new HttpException(
        {
          code: AUTH_ERROR_CODES.rateLimited,
          message: 'Too many attempts. Please wait a moment and try again.',
          retryAfterSeconds,
        },
        429,
      );
    }
    return true;
  }
}

/** Left-most X-Forwarded-For (Cloud Run proxy) or the socket IP locally. */
function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}
