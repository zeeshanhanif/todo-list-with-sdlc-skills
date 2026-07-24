import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AUTH_ERROR_CODES } from '@todo/shared';
import { SessionService } from './session.service';
import { SESSION_COOKIE } from './session.constants';
import type { AuthenticatedRequest } from './current-user.decorator';

/**
 * Authentication guard (FR-AUTHZ-001, partial — the reusable primitive every
 * later data endpoint sits behind). Reads the session cookie, resolves it to a
 * user via SessionService, and attaches `req.user`; a missing/unknown/expired
 * session is a uniform `401 unauthenticated`. The ownership-scoping half of the
 * authz guard (FR-AUTHZ-002/003/005) extends this concern with the first data
 * slice (FEAT-009). Cross-cutting (`common/authz`).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const rawToken = cookies[SESSION_COOKIE] ?? '';

    const user = await this.sessions.resolve(rawToken);
    if (!user) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.unauthenticated,
        message: 'Authentication required.',
      });
    }
    req.user = user;
    return true;
  }
}
