import { IsEmail, MaxLength } from 'class-validator';

/**
 * Request body for POST /auth/forgot. Validated by the global ValidationPipe.
 * The response is always neutral (no enumeration, FR-AUTH-012).
 */
export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254, { message: 'Email is too long.' })
  email!: string;
}
