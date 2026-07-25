import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { DbService } from '../../infra/db.service';
import { SessionService } from './session.service';
import { SessionsRepository } from './sessions.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-004 T2 — SessionService.revoke: deletes the session for the presented
// token and leaves the user's other sessions intact (AC-3); idempotent no-op
// for empty/unknown tokens (AC-2 domain half).
const providers = [SessionService, SessionsRepository, DbService];

describe('SessionService.revoke (integration)', () => {
  let db: DbService;
  let service: SessionService;
  const userIds: string[] = [];

  const freshUser = async (): Promise<string> => {
    const email = `revoke-${randomUUID()}@example.com`;
    const res = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [email],
    );
    userIds.push(res.rows[0].id);
    return res.rows[0].id;
  };

  const sessionCount = async (userId: string): Promise<number> => {
    const r = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM sessions WHERE user_id = $1',
      [userId],
    );
    return Number(r.rows[0].n);
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    service = mod.get(SessionService);
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.query('DELETE FROM users WHERE id = $1', [id]); // cascades sessions
    }
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it("AC-3: revokes only the presented session; the user's other session survives", async () => {
    const id = await freshUser();
    const a = await service.issue(id);
    const b = await service.issue(id);
    expect(await sessionCount(id)).toBe(2);

    await service.revoke(a.rawToken);

    expect(await sessionCount(id)).toBe(1);
    // Session A no longer resolves; session B still does.
    expect(await service.resolve(a.rawToken)).toBeNull();
    const resolvedB = await service.resolve(b.rawToken);
    expect(resolvedB).not.toBeNull();
    expect(resolvedB?.id).toBe(id);
  });

  it('AC-2 (domain): revoke is a no-op for an empty token', async () => {
    const id = await freshUser();
    await service.issue(id);
    await expect(service.revoke('')).resolves.toBeUndefined();
    expect(await sessionCount(id)).toBe(1);
  });

  it('AC-2 (domain): revoke is a no-op for an unknown token', async () => {
    const id = await freshUser();
    await service.issue(id);
    await expect(service.revoke('not-a-real-token')).resolves.toBeUndefined();
    expect(await sessionCount(id)).toBe(1);
  });
});
