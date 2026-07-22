import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Request body for POST /auth/register. Validated by the global ValidationPipe.
 * Email format is checked here (FR-AUTH-003); the password *policy*
 * (length + common-password rejection) is enforced server-side by
 * PasswordPolicyService in AuthService (single source, technical-design §5).
 */
export class RegisterDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254, { message: 'Email is too long.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  password!: string;
}
