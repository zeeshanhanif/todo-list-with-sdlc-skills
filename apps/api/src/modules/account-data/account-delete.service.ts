import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '../../common/crypto/password-hasher';
import { AUDIT_EVENTS, AuditService } from '../../common/audit/audit.service';
import { AccountDeleteRepository } from './account-delete.repository';
import {
  AccountNotFoundError,
  CurrentPasswordInvalidError,
} from './account-data.errors';

/**
 * Permanent account deletion (FEAT-018 technical-design §5.1) — FR-DATA-003,
 * FR-DATA-004, FR-DATA-005.
 *
 * Takes the **session** user's id; nothing here accepts a subject from a
 * request (FR-AUTHZ-004). Its substance is the *order*, which is the design:
 * verify before writing, delete atomically, record after the fact.
 */
@Injectable()
export class AccountDeleteService {
  constructor(
    private readonly repo: AccountDeleteRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
  ) {}

  /**
   * Destroy the caller's account after verifying their password (UC-016 main
   * 3–4).
   *
   * @throws AccountNotFoundError the session resolved but the user row is gone
   *   — either it never existed or a concurrent request deleted it first (→ 401)
   * @throws CurrentPasswordInvalidError the password does not verify; **nothing
   *   has been written** (→ 400)
   */
  async delete(input: {
    userId: string;
    currentPassword: string;
    ip?: string | null;
  }): Promise<void> {
    const ip = input.ip ?? null;

    const stored = await this.repo.findCredential(input.userId);
    if (!stored) {
      throw new AccountNotFoundError();
    }

    const ok = await this.hasher.verify(
      stored.passwordHash,
      input.currentPassword,
    );
    if (!ok) {
      // The user still exists here, so this row carries `userId` the normal way
      // — the contrast with the success path below is deliberate, not an
      // inconsistency (technical-design D6).
      await this.audit
        .record(AUDIT_EVENTS.accountDeleteFailure, {
          userId: input.userId,
          ip,
          detail: { reason: 'wrong_password' },
        })
        .catch(() => undefined);
      throw new CurrentPasswordInvalidError();
    }

    const deleted = await this.repo.deleteAccount(input.userId);
    if (!deleted) {
      // Someone else deleted it between the credential read and here. Reporting
      // success would claim an action this request did not perform.
      throw new AccountNotFoundError();
    }

    // After the commit, and necessarily unattributed at the column level: the
    // FK would reject a row naming the deleted user, and the cascade's SET NULL
    // would blank it moments later anyway (technical-design D6). The id lives
    // in `detail`; the address never does — releasing it is the point.
    //
    // Best-effort, and the `catch` is deliberately NOT redundant with
    // `AuditService.record` swallowing its own errors (the same call the export
    // controller documents): AC-11 makes "an audit failure still leaves the
    // account deleted" a property of THIS path, and inheriting it from a
    // collaborator's promise would mean a change over there silently breaks it
    // here. The stakes are higher than the export's, too — by this point the
    // transaction has committed, so rejecting would tell the user their
    // deletion failed when it did not.
    await this.audit
      .record(AUDIT_EVENTS.accountDeleted, {
        userId: null,
        ip,
        detail: { userId: input.userId },
      })
      .catch(() => undefined);
  }
}
