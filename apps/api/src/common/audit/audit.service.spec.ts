import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { AuditService, AUDIT_EVENTS } from './audit.service';
import { AuditRepository } from './audit.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-003 T5 (NFR-SEC-009): record appends a row; a repository failure is
// swallowed (best-effort — never breaks the caller's critical path).
describe('AuditService (integration)', () => {
  let db: DbService;
  let audit: AuditService;
  const ids: string[] = [];

  const freshUser = async (): Promise<string> => {
    const email = `audit-${randomUUID()}@example.com`;
    const res = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [email],
    );
    ids.push(res.rows[0].id);
    return res.rows[0].id;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        AuditService,
        AuditRepository,
        DbService,
        { provide: APP_CONFIG, useFactory: readConfig },
      ],
    }).compile();
    db = mod.get(DbService);
    audit = mod.get(AuditService);
  });

  afterEach(async () => {
    for (const id of ids) {
      await db.query('DELETE FROM audit_log WHERE user_id = $1', [id]);
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    }
    ids.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('appends a row with the given event, user_id and ip', async () => {
    const userId = await freshUser();
    await audit.record(AUDIT_EVENTS.signInSuccess, {
      userId,
      ip: '203.0.113.7',
      detail: { reason: 'ok' },
    });

    const res = await db.query<{
      event: string;
      ip: string | null;
      detail: { reason: string } | null;
    }>('SELECT event, ip, detail FROM audit_log WHERE user_id = $1', [userId]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].event).toBe('sign_in_success');
    expect(res.rows[0].ip).toBe('203.0.113.7');
    expect(res.rows[0].detail).toEqual({ reason: 'ok' });
  });

  it('is best-effort: a repository failure does not propagate to the caller', async () => {
    const failing = new AuditRepository({} as DbService);
    jest.spyOn(failing, 'insert').mockRejectedValue(new Error('db down'));
    const service = new AuditService(failing);

    await expect(
      service.record(AUDIT_EVENTS.signInFailure, { ip: '203.0.113.7' }),
    ).resolves.toBeUndefined();
  });
});
