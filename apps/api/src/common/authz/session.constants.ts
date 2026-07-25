import type { CookieOptions } from 'express';
import { SESSION_COOKIE } from '@todo/shared';

/** The session cookie name (re-exported from the shared contract so web + API
 * never disagree; FEAT-003 technical-design §3.1). */
export { SESSION_COOKIE };

/**
 * Express cookie options for the session cookie (NFR-SEC-007). `HttpOnly` and
 * `SameSite=Lax` are always on (CSRF baseline — Lax does not send the cookie on
 * cross-site POST); `Secure` is env-gated via `cookieSecure` so the cookie can
 * round-trip over plain HTTP in dev/test. `maxAge` is the session TTL in ms.
 */
export function sessionCookieOptions(
  cookieSecure: boolean,
  ttlMs: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlMs,
  };
}
