import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing with Argon2id (technical-design D1; NFR-SEC-005 — salted,
 * adaptive; plaintext never stored). argon2 generates a random salt per hash and
 * encodes it in the returned string.
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
