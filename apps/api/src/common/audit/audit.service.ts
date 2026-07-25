import { Injectable, Logger } from '@nestjs/common';
import { AuditEvent, AuditRepository } from './audit.repository';

/** Canonical security-event names appended to the audit log (extensible;
 * NFR-SEC-009). Sign-in is the first producer (FEAT-003); password
 * change/reset and account deletion append later ones. */
export const AUDIT_EVENTS = {
  signInSuccess: 'sign_in_success',
  signInFailure: 'sign_in_failure',
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
