import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Request body for POST /auth/change-password. The user is taken from the
 * resolved session, never from the body (FR-AUTHZ-001). The new password's policy
 * is enforced server-side by PasswordPolicyService in AuthService (single source,
 * technical-design §3.1) — no length rules here, so the requirement message
 * cannot drift.
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Current password is required.' })
  currentPassword!: string;

  @IsString()
  @IsNotEmpty({ message: 'New password is required.' })
  newPassword!: string;
}
