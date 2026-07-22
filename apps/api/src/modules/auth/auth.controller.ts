import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { type RegisterResponse } from '@todo/shared';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { EmailTakenError, PasswordPolicyError } from './auth.errors';

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
}
