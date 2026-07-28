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
 * session is a uniform `401 unauthenticated`. Cross-cutting (`common/authz`).
 *
 * **Ownership (FR-AUTHZ-002/003/005) is deliberately NOT a guard.** FEAT-009
 * settled the mechanism: every repository statement in a data module carries
 * `WHERE owner_id = $1`, so no code path can read or write an unowned row, and
 * missing-or-forbidden collapses into one uniform `404` (no enumeration). A
 * `CanActivate` cannot scope a query — it can only pre-fetch a row, duplicating
 * the read and leaving an unscoped repository API behind. See
 * docs/features/FEAT-009-lists/technical-design.md D3; `modules/lists` is the
 * reference implementation every later data module follows.
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
