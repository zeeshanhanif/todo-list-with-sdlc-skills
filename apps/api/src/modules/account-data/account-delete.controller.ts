import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AUTH_ERROR_CODES,
  SESSION_COOKIE,
  type DeleteAccountResponse,
  type SessionUser,
} from '@todo/shared';
import { APP_CONFIG, type AppConfig } from '../../infra/config';
import { SessionGuard } from '../../common/authz/session.guard';
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { clearSessionCookieOptions } from '../../common/authz/session.constants';
import { AccountDeleteService } from './account-delete.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import {
  AccountNotFoundError,
  CurrentPasswordInvalidError,
} from './account-data.errors';

// Permanent account deletion (FR-DATA-003/004/005/006) — FEAT-018.
// Authenticated (FR-AUTHZ-001) and operating on the SESSION user only: the body
// carries a password and a confirmation, never a subject, so there is no request
// shape that addresses another account (FR-AUTHZ-004).
//
// Rate-limited per IP, unlike its sibling the export (technical-design D9): this
// endpoint verifies a password, which makes it a credential-guessing surface —
// the same reasoning that put the guard on change-password (NFR-SEC-006).
//
// Deliberately NOT decorated with ChangeSignalInterceptor (D7): the other
// devices' cue is session revocation — their next request is a 401 and the
// client redirects to sign-in — and hanging a security-relevant effect off
// Realtime would contradict the architecture's rule that it is a best-effort
// optimization, never a source of truth. There is also nothing left to refetch.
@Controller('account')
@UseGuards(SessionGuard, RateLimitGuard)
export class AccountDeleteController {
  constructor(
    private readonly deleter: AccountDeleteService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * POST /account/delete (FR-DATA-003/004/005; UC-016 main 3–5) — matches
   * `ACCOUNT_DELETE_PATH`.
   *
   * Irreversible and not idempotent: a repeat lands on `401`, because the
   * session died with the account. The response clears the session cookie the
   * way sign-out does — every session was revoked server-side by the cascade
   * (FR-DATA-005), and leaving the browser holding a cookie for a session that
   * no longer exists would be a small lie with a confusing redirect at the end
   * of it.
   */
  @Post('delete')
  @HttpCode(200)
  async delete(
    @Body() dto: DeleteAccountDto,
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DeleteAccountResponse> {
    try {
      await this.deleter.delete({
        userId: user.id,
        currentPassword: dto.currentPassword,
        ip: clientIp(req),
      });
    } catch (err) {
      throw toHttp(err);
    }

    res.clearCookie(
      SESSION_COOKIE,
      clearSessionCookieOptions(this.config.cookieSecure),
    );
    return { status: 'account_deleted' };
  }
}

/** Map the module's domain errors onto the designed HTTP responses
 * (technical-design §3.1); the global filter renders the ApiError envelope.
 * Anything unrecognized is returned as-is → 500 internal_error, which is where a
 * failed deletion transaction lands — having rolled back, so the account is
 * intact (AC-10). */
function toHttp(err: unknown): unknown {
  if (err instanceof CurrentPasswordInvalidError) {
    // 400, not 401: on an authenticated route 401 means "your session is gone"
    // and the client redirects to sign-in, losing the screen over a typo
    // (technical-design D4, inherited from FEAT-006 D3).
    return new BadRequestException({
      code: AUTH_ERROR_CODES.currentPasswordInvalid,
      message: err.message,
      fields: [{ field: 'currentPassword', message: err.message }],
    });
  }
  if (err instanceof AccountNotFoundError) {
    // The session resolved but the account is gone — it never existed, or a
    // concurrent request deleted it first. To a caller that is the same fact as
    // an invalid session (§3.1), and it is the shape a second delete gets.
    return new UnauthorizedException({
      code: AUTH_ERROR_CODES.unauthenticated,
      message: 'Sign in to continue.',
    });
  }
  return err;
}

/** Left-most X-Forwarded-For (Cloud Run proxy) or the socket IP locally — the
 * same resolution `auth.controller.ts` uses for the limiter and the audit log. */
function clientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip ?? null;
}
