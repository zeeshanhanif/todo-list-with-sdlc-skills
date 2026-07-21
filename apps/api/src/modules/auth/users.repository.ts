import { Injectable } from '@nestjs/common';
import { TxClient } from '../../infra/db.service';

export interface NewUser {
  email: string; // already normalized (trim+lowercase)
  passwordHash: string;
  verificationTokenHash: string;
  verificationTokenExpiresAt: Date;
}

@Injectable()
export class UsersRepository {
  /** Insert an unverified user. Throws pg 23505 on users_email_key if the email
   * exists — AuthService maps that to EmailTakenError. */
  async create(tx: TxClient, u: NewUser): Promise<{ id: string }> {
    const res = await tx.query<{ id: string }>(
      `INSERT INTO users
         (email, password_hash, verification_token_hash, verification_token_expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        u.email,
        u.passwordHash,
        u.verificationTokenHash,
        u.verificationTokenExpiresAt,
      ],
    );
    return res.rows[0];
  }
}
