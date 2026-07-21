import { Injectable } from '@nestjs/common';
import { DbService } from '../../infra/db.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordHasher } from './password-hasher';
import { VerificationTokenService } from './verification-token.service';
import { UsersRepository } from './users.repository';
import { ListsRepository } from './lists.repository';
import { EmailOutboxRepository } from './email-outbox.repository';
import { EmailTakenError, PasswordPolicyError } from './auth.errors';

/**
 * Registration orchestration (FR-AUTH-001/002/005, FR-LIST-003; technical-design §5):
 * normalize email → enforce password policy → hash → issue verification token →
 * insert user + Inbox + verification outbox row in ONE transaction (ADR-003, AC-8).
 * A duplicate email surfaces as pg 23505 and maps to EmailTakenError (race-safe).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly policy: PasswordPolicyService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: VerificationTokenService,
    private readonly users: UsersRepository,
    private readonly lists: ListsRepository,
    private readonly outbox: EmailOutboxRepository,
  ) {}

  async register(input: { email: string; password: string }): Promise<void> {
    const email = input.email.trim().toLowerCase();

    const requirement = this.policy.check(input.password);
    if (requirement) {
      throw new PasswordPolicyError(requirement);
    }

    const passwordHash = await this.hasher.hash(input.password);
    const token = this.tokens.issue();

    try {
      await this.db.transaction(async (tx) => {
        const user = await this.users.create(tx, {
          email,
          passwordHash,
          verificationTokenHash: token.hash,
          verificationTokenExpiresAt: token.expiresAt,
        });
        await this.lists.createDefaultInbox(tx, user.id);
        await this.outbox.enqueueVerification(tx, {
          recipient: email,
          userId: user.id,
          token: token.raw,
        });
      });
    } catch (err) {
      if (this.isEmailUniqueViolation(err)) {
        throw new EmailTakenError();
      }
      throw err;
    }
  }

  private isEmailUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; constraint?: string };
    return (
      e?.code === '23505' && String(e.constraint ?? '').includes('users_email')
    );
  }
}
