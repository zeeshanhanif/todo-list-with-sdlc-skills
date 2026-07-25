import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
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
  type ForgotPasswordResponse,
  type RegisterResponse,
  type ResendVerificationResponse,
  type ResetPasswordResponse,
  type SessionResponse,
  type SessionUser,
  type SignInResponse,
  type SignOutResponse,
  type VerifyResponse,
} from '@todo/shared';
import { loadConfig } from '../../infra/config';
import { clearSessionCookieOptions } from '../../common/authz/session.constants';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyDto } from './dto/verify.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SignInDto } from './dto/sign-in.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  AccountLockedError,
  EmailNotVerifiedError,
  EmailTakenError,
  InvalidCredentialsError,
  PasswordPolicyError,
  TokenExpiredError,
  TokenInvalidError,
} from './auth.errors';
import { RateLimitGuard } from '../../common/rate-limit/rate-limit.guard';
import { SessionGuard } from '../../common/authz/session.guard';
import { CurrentUser } from '../../common/authz/current-user.decorator';

// Auth endpoints (FR-AUTH-*). Every state-changing auth endpoint is behind the
// per-IP RateLimitGuard (FR-AUTH-018; retrofit of register/verify/resend done in
// FEAT-003). Domain errors are translated to the designed HTTP responses; the
// global filter renders the ApiError envelope.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @UseGuards(RateLimitGuard)
  @HttpCode(201)
  async register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    try {
      await this.auth.register(dto);
      return { status: 'verification_sent' };
    } catch (err) {
      if (err instanceof EmailTakenError) {
        throw new ConflictException({
          code: 'email_taken',
          message: err.message,
        });
      }
      if (err instanceof PasswordPolicyError) {
        throw new BadRequestException({
          code: 'validation_failed',
          message: 'Validation failed.',
          fields: [{ field: 'password', message: err.requirement }],
        });
      }
      throw err; // → 500 internal_error via the filter
    }
  }

  // POST /auth/login (FR-AUTH-009/010/007/016/019; UC-003) — matches LOGIN_PATH.
  // On success issues the opaque session cookie (ADR-005); failures are generic
  // (no enumeration). Rate-limited per IP (FR-AUTH-018).
  @Post('login')
  @UseGuards(RateLimitGuard)
  @HttpCode(200)
  async login(
    @Body() dto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignInResponse> {
    try {
      const { user, session } = await this.auth.signIn({
        email: dto.email,
        password: dto.password,
        ip: clientIp(req),
      });
      res.cookie(SESSION_COOKIE, session.rawToken, session.cookieOptions);
      return { status: 'signed_in', user };
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.invalidCredentials,
          message: err.message,
        });
      }
      if (err instanceof EmailNotVerifiedError) {
        throw new ForbiddenException({
          code: AUTH_ERROR_CODES.emailNotVerified,
          message: err.message,
        });
      }
      if (err instanceof AccountLockedError) {
        throw new HttpException(
          {
            code: AUTH_ERROR_CODES.accountLocked,
            message: err.message,
            retryAfterSeconds: err.retryAfterSeconds,
          },
          423,
        );
      }
      throw err; // → 500 internal_error via the filter
    }
  }

  // GET /auth/session (FR-AUTHZ-001; UC-003) — matches SESSION_PATH. The current
  // session's user; 401 unauthenticated when no valid session (SessionGuard).
  @Get('session')
  @UseGuards(SessionGuard)
  session(@CurrentUser() user: SessionUser): SessionResponse {
    return { user };
  }

  // POST /auth/logout (FR-AUTH-011; UC-004) — matches LOGOUT_PATH. Unguarded and
  // idempotent (technical-design D1): revokes the current session if the cookie
  // resolves to one, and always clears the cookie + returns 200.
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignOutResponse> {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    await this.auth.signOut(cookies[SESSION_COOKIE] ?? '');
    res.clearCookie(
      SESSION_COOKIE,
      clearSessionCookieOptions(loadConfig().cookieSecure),
    );
    return { status: 'signed_out' };
  }

  // POST /auth/verify (FR-AUTH-006, NFR-SEC-004; UC-002) — matches VERIFY_PATH.
  // Consumes the single-use token; invalid/expired map to the designed envelope.
  @Post('verify')
  @UseGuards(RateLimitGuard)
  @HttpCode(200)
  async verify(@Body() dto: VerifyDto): Promise<VerifyResponse> {
    try {
      await this.auth.verifyEmail(dto.token);
      return { status: 'verified' };
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new BadRequestException({
          code: 'token_expired',
          message: err.message,
        });
      }
      if (err instanceof TokenInvalidError) {
        throw new BadRequestException({
          code: 'token_invalid',
          message: err.message,
        });
      }
      throw err; // → 500 internal_error via the filter
    }
  }

  // POST /auth/verify/resend (FR-AUTH-008; UC-002) — matches
  // RESEND_VERIFICATION_PATH. Always neutral 200 (no enumeration, D3); the
  // service performs its side effect only for an eligible account past cooldown.
  @Post('verify/resend')
  @UseGuards(RateLimitGuard)
  @HttpCode(200)
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<ResendVerificationResponse> {
    await this.auth.resendVerification(dto.email);
    return { status: 'verification_sent' };
  }

  // POST /auth/forgot (FR-AUTH-012/013; UC-005) — matches FORGOT_PATH. Always a
  // neutral 200 (no enumeration, D3-style); the service performs its side effect
  // only for a registered address. Rate-limited per IP (FR-AUTH-018).
  @Post('forgot')
  @UseGuards(RateLimitGuard)
  @HttpCode(200)
  async forgot(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponse> {
    await this.auth.requestPasswordReset(dto.email);
    return { status: 'reset_requested' };
  }

  // POST /auth/reset (FR-AUTH-014/017; UC-005) — matches RESET_PATH. Consumes the
  // single-use reset token, sets the new password, and invalidates all sessions.
  // Rate-limited per IP (FR-AUTH-018).
  @Post('reset')
  @UseGuards(RateLimitGuard)
  @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto): Promise<ResetPasswordResponse> {
    try {
      await this.auth.resetPassword(dto.token, dto.password);
      return { status: 'password_reset' };
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new BadRequestException({
          code: 'token_expired',
          message: err.message,
        });
      }
      if (err instanceof TokenInvalidError) {
        throw new BadRequestException({
          code: 'token_invalid',
          message: err.message,
        });
      }
      if (err instanceof PasswordPolicyError) {
        throw new BadRequestException({
          code: 'validation_failed',
          message: 'Validation failed.',
          fields: [{ field: 'password', message: err.requirement }],
        });
      }
      throw err; // → 500 internal_error via the filter
    }
  }
}

/** Left-most X-Forwarded-For (Cloud Run proxy) or the socket IP locally. */
function clientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip ?? null;
}
