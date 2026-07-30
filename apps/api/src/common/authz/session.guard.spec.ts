import { randomUUID } from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { SessionService } from './session.service';
import { SessionsRepository } from './sessions.repository';
import { SessionGuard } from './session.guard';
import { SESSION_COOKIE } from './session.constants';
import type { AuthenticatedRequest } from './current-user.decorator';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-003 T4: the guard admits a valid session cookie (exposing req.user) and
// rejects missing/invalid cookies with 401 (AC-7, guard half).
const providers = [
  SessionGuard,
  SessionService,
  SessionsRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

const contextWithCookies = (
  cookies: Record<string, string>,
): { ctx: ExecutionContext; req: AuthenticatedRequest } => {
  const req = { cookies } as unknown as AuthenticatedRequest;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
};

describe('SessionGuard (integration)', () => {
  let db: DbService;
  let guard: SessionGuard;
  let sessions: SessionService;
  const userIds: string[] = [];

  const freshUserSession = async (): Promise<{
    id: string;
    email: string;
    rawToken: string;
  }> => {
    const email = `guard-${randomUUID()}@example.com`;
    const res = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [email],
    );
    const id = res.rows[0].id;
    userIds.push(id);
    const { rawToken } = await sessions.issue(id);
    return { id, email, rawToken };
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    guard = mod.get(SessionGuard);
    sessions = mod.get(SessionService);
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    }
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('AC-7: admits a valid session cookie and attaches req.user', async () => {
    const { id, email, rawToken } = await freshUserSession();
    const { ctx, req } = contextWithCookies({ [SESSION_COOKIE]: rawToken });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ id, email });
  });

  it('AC-7: rejects a request with no session cookie (401 unauthenticated)', async () => {
    const { ctx } = contextWithCookies({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('AC-7: rejects an unknown/invalid session token (401)', async () => {
    const { ctx } = contextWithCookies({ [SESSION_COOKIE]: 'bogus-token' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
