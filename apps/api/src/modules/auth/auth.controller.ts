import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import {
  type RegisterResponse,
  type ResendVerificationResponse,
  type VerifyResponse,
} from '@todo/shared';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyDto } from './dto/verify.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import {
  EmailTakenError,
  PasswordPolicyError,
  TokenExpiredError,
  TokenInvalidError,
} from './auth.errors';

// POST /auth/register (FR-AUTH-001/002/003/004; UC-001) — matches
// REGISTER_PATH in @todo/shared. Translates domain errors to the designed HTTP
// responses; the global filter renders the envelope.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
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

  // POST /auth/verify (FR-AUTH-006, NFR-SEC-004; UC-002) — matches VERIFY_PATH.
  // Consumes the single-use token; invalid/expired map to the designed envelope.
  @Post('verify')
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
  @HttpCode(200)
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<ResendVerificationResponse> {
    await this.auth.resendVerification(dto.email);
    return { status: 'verification_sent' };
  }
}
