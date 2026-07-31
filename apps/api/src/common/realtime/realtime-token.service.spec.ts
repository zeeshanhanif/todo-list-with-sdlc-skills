import { createHmac } from 'crypto';
import { readConfig, type AppConfig } from '../../infra/config';
import {
  RealtimeTokenService,
  type RealtimeTokenClaims,
} from './realtime-token.service';

// FEAT-019 T2 / AC-5, AC-8 — what the mint puts in the token, and what it does
// NOT put anywhere. Config is injected (DEF-008), so these tests hand the service
// the settings they need instead of mutating process.env and restoring it — no
// global state, and nothing here can be perturbed by a developer's own .env.

const SECRET = 'test-jwt-secret-value';
const USER = '11111111-1111-4111-8111-111111111111';

/** A config with this spec's realtime settings; everything else is the default. */
const cfg = (over: Partial<AppConfig> = {}): AppConfig => ({
  ...readConfig(),
  supabaseJwtSecret: SECRET,
  realtimeTokenTtlMinutes: 30,
  ...over,
});

describe('RealtimeTokenService', () => {
  const service = new RealtimeTokenService(cfg());

  it('signs the claims Supabase Realtime needs, and only those', () => {
    const { token } = service.mint(USER);
    const [header, payload] = token.split('.');

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as RealtimeTokenClaims;
    expect(claims.sub).toBe(USER);
    expect(claims.role).toBe('authenticated');
    // No email, no session id, no list of anything — the token is an identity
    // for one socket, not a copy of the session.
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
  });

  it('verifies under the configured secret and fails under a wrong one', () => {
    const { token } = service.mint(USER);
    expect(service.verify(token)?.sub).toBe(USER);

    const otherSecret = new RealtimeTokenService(
      cfg({ supabaseJwtSecret: 'a-different-secret' }),
    );
    expect(otherSecret.verify(token)).toBeNull();
  });

  it('rejects a tampered subject — the signature covers the claims', () => {
    const { token } = service.mint(USER);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        sub: '22222222-2222-4222-8222-222222222222',
        role: 'authenticated',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 1800,
      }),
    ).toString('base64url');

    expect(service.verify(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('gives exp - iat exactly the configured TTL, and expiresAt agrees', () => {
    const fifteen = new RealtimeTokenService(
      cfg({ realtimeTokenTtlMinutes: 15 }),
    );
    const { token, expiresAt } = fifteen.mint(USER);
    const claims = fifteen.verify(token)!;

    expect(claims.exp - claims.iat).toBe(15 * 60);
    expect(expiresAt.getTime()).toBe(claims.exp * 1000);
  });

  it('treats an expired token as invalid even with a good signature', () => {
    const expired = new RealtimeTokenService(
      cfg({ realtimeTokenTtlMinutes: -1 }),
    );
    const { token } = expired.mint(USER);

    // The signature is genuine — expiry alone is the reason it fails.
    const [header, payload, signature] = token.split('.');
    expect(signature).toBe(
      createHmac('sha256', SECRET)
        .update(`${header}.${payload}`)
        .digest('base64url'),
    );
    expect(expired.verify(token)).toBeNull();
  });

  it('encodes base64url without padding', () => {
    const { token } = service.mint(USER);
    expect(token).not.toContain('=');
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token.split('.')).toHaveLength(3);
  });

  it('derives the channel from the subject, never from a caller', () => {
    expect(service.mint(USER).channel).toBe(`user:${USER}`);
  });
});

describe('realtime config defaults', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('is off unless explicitly switched on, with no secret defaults', () => {
    delete process.env.REALTIME_PROVIDER;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_JWT_SECRET;

    const config = readConfig();
    // `none` is the default because no Supabase project is provisioned yet —
    // the client falls back to its adaptive refetch schedule (D4).
    expect(config.realtimeProvider).toBe('none');
    expect(config.supabaseUrl).toBe('');
    expect(config.supabaseServiceRoleKey).toBe('');
    expect(config.supabasePublishableKey).toBe('');
    expect(config.supabaseJwtSecret).toBe('');
    // NFR-MAINT-003: no committed secret, and no baked-in fallback that would
    // make an unconfigured deployment look configured.
    expect(config.realtimeTokenTtlMinutes).toBe(30);
    expect(config.realtimePublishTimeoutMs).toBe(250);
  });

  it('only ever recognizes the one provider it implements', () => {
    process.env.REALTIME_PROVIDER = 'pusher';
    expect(readConfig().realtimeProvider).toBe('none');

    process.env.REALTIME_PROVIDER = 'supabase';
    expect(readConfig().realtimeProvider).toBe('supabase');
  });
});
