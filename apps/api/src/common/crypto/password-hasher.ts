import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing with Argon2id (FEAT-001 technical-design D1; NFR-SEC-005 —
 * salted, adaptive; plaintext never stored). argon2 generates a random salt per
 * hash and encodes it in the returned string.
 *
 * Cross-cutting (`common/crypto`) rather than owned by `modules/auth`: two
 * capability modules now verify passwords — `auth` (sign-in, reset, change) and
 * `account-data` (delete account, FR-DATA-004) — and the boundary rule forbids
 * the second importing the first (FEAT-018 D2). NFR-SEC-005 also wants exactly
 * one Argon2id configuration in the system, which a second copy would not be.
 * Same reasoning that put `common/authz/sessions.repository.ts` where it is.
 */
@Injectable()
export class PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
