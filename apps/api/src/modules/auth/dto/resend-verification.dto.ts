import { IsEmail, MaxLength } from 'class-validator';

/**
 * Request body for POST /auth/verify/resend. Email format validated here
 * (FR-AUTH-003 convention); normalized (trim+lowercase) in AuthService. The
 * response is neutral regardless of whether the address exists (technical-design D3).
 */
export class ResendVerificationDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254, { message: 'Email is too long.' })
  email!: string;
}
