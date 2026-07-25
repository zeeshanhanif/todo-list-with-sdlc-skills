import { Injectable } from '@nestjs/common';
import { DbService } from '../../infra/db.service';

/** One security-audit event to append (FEAT-003 §4.3; NFR-SEC-009). */
export interface AuditEvent {
  event: string;
  userId?: string | null;
  ip?: string | null;
  detail?: Record<string, unknown> | null;
}

/** Append-only writer for the `audit_log` table (NFR-SEC-009). No update or
 * delete path — the log is immutable and retention-swept elsewhere. */
@Injectable()
export class AuditRepository {
  constructor(private readonly db: DbService) {}

  async insert(e: AuditEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_log (user_id, event, ip, detail)
       VALUES ($1, $2, $3, $4)`,
      [
        e.userId ?? null,
        e.event,
        e.ip ?? null,
        e.detail ? JSON.stringify(e.detail) : null,
      ],
    );
  }
}
