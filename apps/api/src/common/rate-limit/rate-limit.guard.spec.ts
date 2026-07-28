import { randomUUID } from 'crypto';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DbService } from '../../infra/db.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitRepository } from './rate-limit.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-003 T6 (FR-AUTH-018): attempts up to the max pass, the next is 429 with
// retryAfterSeconds; a different window keys a fresh count.
const contextForIp = (ip: string): ExecutionContext => {
  const req = {
    method: 'POST',
    path: '/auth/login',
    route: { path: '/auth/login' },
    headers: { 'x-forwarded-for': ip },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
};

describe('RateLimitGuard (integration)', () => {
  let db: DbService;
  let guard: RateLimitGuard;
  let repo: RateLimitRepository;
  const ips: string[] = [];
  const prevMax = process.env.AUTH_RATELIMIT_MAX;

  const freshIp = (): string => {
    const ip = `198.18.12.${Math.floor(Math.random() * 250) + 1}-${randomUUID()}`;
    ips.push(ip);
    return ip;
  };

  beforeAll(async () => {
    process.env.AUTH_RATELIMIT_MAX = '3'; // small limit for a fast test
    const mod = await Test.createTestingModule({
      providers: [RateLimitGuard, RateLimitRepository, DbService],
    }).compile();
    db = mod.get(DbService);
    guard = mod.get(RateLimitGuard);
    repo = mod.get(RateLimitRepository);
  });

  afterEach(async () => {
    for (const ip of ips) {
      await db.query('DELETE FROM auth_rate_buckets WHERE ip = $1', [ip]);
    }
    ips.length = 0;
  });

  afterAll(async () => {
    if (prevMax === undefined) delete process.env.AUTH_RATELIMIT_MAX;
    else process.env.AUTH_RATELIMIT_MAX = prevMax;
    await db.onModuleDestroy();
  });

  it('AC-6: allows up to the max, then 429 rate_limited with retryAfterSeconds', async () => {
    const ctx = contextForIp(freshIp());
    // 3 allowed
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // 4th over the limit
    try {
      await guard.canActivate(ctx);
      throw new Error('expected a 429 to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const e = err as HttpException;
      expect(e.getStatus()).toBe(429);
      const body = e.getResponse() as {
        code: string;
        retryAfterSeconds: number;
      };
      expect(body.code).toBe('rate_limited');
      expect(body.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('keys the count by window — a different window starts fresh at 1', async () => {
    const ip = freshIp();
    const w1 = new Date('2026-07-24T10:00:00.000Z');
    const w2 = new Date('2026-07-24T10:15:00.000Z');
    expect(await repo.hitAndCount(ip, 'POST /auth/login', w1)).toBe(1);
    expect(await repo.hitAndCount(ip, 'POST /auth/login', w1)).toBe(2);
    expect(await repo.hitAndCount(ip, 'POST /auth/login', w2)).toBe(1);
  });
});
