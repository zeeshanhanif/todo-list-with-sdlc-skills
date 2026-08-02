import { Equals, IsBoolean, IsNotEmpty, IsString } from 'class-validator';

/**
 * Request body for `POST /account/delete` (FEAT-018 technical-design §3.1). The
 * account deleted is the resolved session's, never one named in the body
 * (FR-AUTHZ-001/004).
 */
export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Your password is required.' })
  currentPassword!: string;

  /**
   * Must be exactly `true`. FR-DATA-004 requires an explicit confirmation of
   * **the system**, not only of the screen (technical-design D3) — so a caller
   * that sends a password alone, or `confirm: false`, gets a `400` and keeps
   * their account. `@Equals(true)` rather than `@IsBoolean()` alone: the point
   * is not that the field is a boolean, it is that it affirms.
   */
  @IsBoolean()
  @Equals(true, { message: 'Confirmation is required to delete your account.' })
  confirm!: true;
}
