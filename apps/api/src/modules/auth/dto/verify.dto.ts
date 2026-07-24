import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Request body for POST /auth/verify. The raw token from the email link; its
 * hash is matched server-side (technical-design §3). MaxLength bounds the hash
 * input (DoS guard) — the issued token is ~43 base64url chars.
 */
export class VerifyDto {
  @IsString()
  @IsNotEmpty({ message: 'Verification token is required.' })
  @MaxLength(512, { message: 'Verification token is too long.' })
  token!: string;
}
