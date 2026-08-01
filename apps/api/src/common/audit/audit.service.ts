import { Injectable, Logger } from '@nestjs/common';
import { AuditEvent, AuditRepository } from './audit.repository';

/** Canonical security-event names appended to the audit log (extensible;
 * NFR-SEC-009). Sign-in is the first producer (FEAT-003); password
 * change/reset and account deletion append later ones. */
export const AUDIT_EVENTS = {
  signInSuccess: 'sign_in_success',
  signInFailure: 'sign_in_failure',
  /** A signed-in user changed their own password (FEAT-006; FR-AUTH-015). */
  passwordChanged: 'password_changed',
  /** A change-password attempt failed the current-password check (FEAT-006;
   * UC-006 alt 3a). Never carries the submitted password. */
  passwordChangeFailure: 'password_change_failure',
  /** A user exported their entire account (FEAT-017; FR-DATA-001,
   * technical-design D6). NFR-SEC-009's list is illustrative rather than
   * exhaustive — this is the single most sensitive *read* in the product, and
   * since the endpoint changes no domain state this row is the only durable
   * trace that it happened. Carries the user id and nothing else: the audit log
   * must never become a second copy of the data it protects, so no list names,
   * no titles, not even counts. */
  dataExported: 'data_exported',
  /**
   * A user permanently deleted their own account (FEAT-018; FR-DATA-003) —
   * named explicitly by NFR-SEC-009.
   *
   * Written **after** the deletion transaction commits, and necessarily with
   * `userId: null` + the id in `detail`: `audit_log.user_id` is a foreign key,
   * so a row naming the just-deleted user would be rejected — and because this
   * service swallows its own errors, the naive version would silently record
   * nothing at all for the single most consequential event in the product
   * (technical-design D6). Carries the id, the IP and nothing else: never the
   * email address the deletion just released.
   */
  accountDeleted: 'account_deleted',
  /** A delete-account attempt failed the password check (FEAT-018; UC-016 alt
   * 3a). The user still exists at this point, so this one carries `userId`
   * normally. Never carries the submitted password. */
  accountDeleteFailure: 'account_delete_failure',
} as const;

/**
 * Records security-relevant events to the audit log (NFR-SEC-009). **Best-effort
 * by contract**: a logging failure must never break the security-sensitive
 * operation that triggered it, so `record` swallows and logs its own errors
 * rather than propagating. Cross-cutting (`common/audit`).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly repo: AuditRepository) {}

  async record(
    event: string,
    meta: Omit<AuditEvent, 'event'> = {},
  ): Promise<void> {
    try {
      await this.repo.insert({ event, ...meta });
    } catch (err) {
      // Never let audit failure surface into the caller's critical path.
      this.logger.error(
        JSON.stringify({
          msg: 'audit write failed',
          event,
          error: String(err),
        }),
      );
    }
  }
}
