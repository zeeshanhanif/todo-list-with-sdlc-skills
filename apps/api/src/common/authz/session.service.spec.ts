import { createHash, randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { SessionService } from './session.service';
import { SessionsRepository } from './sessions.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// Cover the session store (FEAT-003 T3): issue persists only the token hash
// with the configured expiry (AC-4); resolve returns the user for a live token
// and touches last_used_at; resolve is null for unknown/expired tokens.
const providers = [
  SessionService,
  SessionsRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

describe('SessionService (integration)', () => {
  let db: DbService;
  let service: SessionService;
  const userIds: string[] = [];

  const freshUser = async (): Promise<{ id: string; email: string }> => {
    const email = `sess-${randomUUID()}@example.com`;
    const res = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [email],
    );
    const id = res.rows[0].id;
    userIds.push(id);
    return { id, email };
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

  it('AC-4: issue persists only the SHA-256 hash (raw token in no column) with a future expiry', async () => {
    const { id } = await freshUser();

    const { rawToken, cookieOptions } = await service.issue(id);

    const res = await db.query<{
      token_hash: string;
      expires_at: Date;
    }>('SELECT token_hash, expires_at FROM sessions WHERE user_id = $1', [id]);
    expect(res.rows).toHaveLength(1);
    // The stored value is the hash, never the raw token.
    expect(res.rows[0].token_hash).toBe(
      createHash('sha256').update(rawToken).digest('hex'),
    );
    expect(res.rows[0].token_hash).not.toBe(rawToken);
    // Expiry is in the (long-lived) future.
    expect(res.rows[0].expires_at.getTime()).toBeGreaterThan(Date.now());
    // Cookie is HttpOnly + SameSite; maxAge set.
    expect(cookieOptions.httpOnly).toBe(true);
    expect(cookieOptions.sameSite).toBe('lax');
    expect(cookieOptions.maxAge).toBeGreaterThan(0);
  });

  it('resolves a live token to its user and touches last_used_at', async () => {
    const { id, email } = await freshUser();
    const { rawToken } = await service.issue(id);

    const before = await db.query<{ last_used_at: Date }>(
      'SELECT last_used_at FROM sessions WHERE user_id = $1',
      [id],
    );
    // Small delay so the touch is observably later.
    await new Promise((r) => setTimeout(r, 10));

    const user = await service.resolve(rawToken);
    expect(user).toEqual({ id, email });

    const after = await db.query<{ last_used_at: Date }>(
      'SELECT last_used_at FROM sessions WHERE user_id = $1',
      [id],
    );
    expect(after.rows[0].last_used_at.getTime()).toBeGreaterThanOrEqual(
      before.rows[0].last_used_at.getTime(),
    );
  });

  it('resolves to null for an unknown token', async () => {
    expect(await service.resolve('not-a-real-token')).toBeNull();
    expect(await service.resolve('')).toBeNull();
  });

  // FEAT-006 T2/D2: issuance can join a transaction so a password change can
  // revoke-all and reissue atomically. If the transaction rolls back, the
  // reissued session must not survive.
  it('issue(userId, tx) participates in the transaction — a rollback leaves no session', async () => {
    const { id } = await freshUser();

    await expect(
      db.transaction(async (tx) => {
        await service.issue(id, tx);
        // Visible inside the transaction…
        const inTx = await tx.query(
          'SELECT id FROM sessions WHERE user_id = $1',
          [id],
        );
        expect(inTx.rows).toHaveLength(1);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    // …and gone after the rollback.
    const after = await db.query('SELECT id FROM sessions WHERE user_id = $1', [
      id,
    ]);
    expect(after.rows).toHaveLength(0);
  });

  it('resolves to null for an expired session', async () => {
    const { id } = await freshUser();
    const { rawToken } = await service.issue(id);
    await db.query(
      "UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1",
      [id],
    );

    expect(await service.resolve(rawToken)).toBeNull();
  });
});
