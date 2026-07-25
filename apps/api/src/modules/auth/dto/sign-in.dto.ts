import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Request body for POST /auth/login. Validated by the global ValidationPipe
 * (400 validation_failed on malformed input, AC-9). The credential check itself
 * is generic and lives in AuthService.signIn (no enumeration, FR-AUTH-010).
 */
export class SignInDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254, { message: 'Email is too long.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  password!: string;
}
