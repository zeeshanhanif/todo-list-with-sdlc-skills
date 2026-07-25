import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '@todo/shared';

/** Requests that have passed SessionGuard carry the resolved user. */
export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

/**
 * Injects the current authenticated user (set by SessionGuard). Using it on a
 * route not behind SessionGuard is a programming error — fail loudly rather
 * than hand a handler an undefined user (FEAT-003 §3.3).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) {
      throw new InternalServerErrorException(
        'CurrentUser used without SessionGuard',
      );
    }
    return req.user;
  },
);
