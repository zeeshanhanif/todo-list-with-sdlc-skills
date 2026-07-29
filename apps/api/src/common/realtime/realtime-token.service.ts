import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { userChannel } from '@todo/shared';
import { loadConfig } from '../../infra/config';

/** What a minted token grants: one user, one channel, for a short while. */
export interface MintedRealtimeToken {
  token: string;
  /** Always `user:{userId}` — derived here, never taken from a request. */
  channel: string;
  expiresAt: Date;
}

/** The claims Supabase Realtime needs, and no others (FEAT-019 D5). */
export interface RealtimeTokenClaims {
  sub: string;
  role: 'authenticated';
  iat: number;
  exp: number;
}

/**
 * Mints the short-lived, channel-scoped tokens the web client uses to open its
 * Supabase Realtime socket (ADR-006: *"a short-lived Supabase-compatible JWT
 * that NestJS mints"*).
 *
 * **Hand-rolled HS256 rather than a JWT dependency** (technical-design D5):
 * three claims and one HMAC is smaller and more auditable than a library, and
 * it is the same call the module already makes for its other token crypto
 * (`verification-token.service.ts` hashes with `node:crypto` too).
 *
 * The subject is always supplied by the caller from `@CurrentUser()` — this
 * service has no way to learn a user id from a request, which is half of why
 * FR-AUTHZ-002/003 hold structurally here (the other half is that the endpoint
 * accepts no parameters at all).
 *
 * The signing secret is read **inside `mint`**, so a deployment with no provider
 * configured never touches it.
 */
@Injectable()
export class RealtimeTokenService {
  mint(userId: string): MintedRealtimeToken {
    const config = loadConfig();
    const ttlSeconds = config.realtimeTokenTtlMinutes * 60;
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + ttlSeconds;

    const claims: RealtimeTokenClaims = {
      sub: userId,
      role: 'authenticated',
      iat,
      exp,
    };

    const signingInput = `${b64url(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    )}.${b64url(JSON.stringify(claims))}`;

    return {
      token: `${signingInput}.${sign(signingInput, config.supabaseJwtSecret)}`,
      channel: userChannel(userId),
      // `exp` is seconds; the Date is the same instant, for the wire's
      // ISO-8601 rendering (NFR-LOC-001).
      expiresAt: new Date(exp * 1000),
    };
  }

  /**
   * Verifies a token against the configured secret and returns its claims, or
   * `null` if the signature, structure or expiry fails.
   *
   * Nothing in the API authenticates with this — the session cookie is the only
   * credential the guard reads (AC-6). It exists so tests can assert what was
   * minted rather than trusting the mint, and so an operator can check a token
   * without pasting a secret into a web decoder.
   */
  verify(token: string): RealtimeTokenClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expected = sign(
      `${header}.${payload}`,
      loadConfig().supabaseJwtSecret,
    );
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      return null;
    }

    try {
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as RealtimeTokenClaims;
      if (claims.exp * 1000 <= Date.now()) return null;
      return claims;
    } catch {
      return null;
    }
  }
}

/** base64url, unpadded — JWT's encoding (RFC 7515 §2). */
function b64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(signingInput: string, secret: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}
