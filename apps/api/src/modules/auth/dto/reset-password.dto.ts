import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Request body for POST /auth/reset. The token comes from the reset-email link;
 * the password policy itself is enforced server-side by PasswordPolicyService in
 * AuthService (single source, technical-design §5).
 */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required.' })
  token!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  password!: string;
}
