import { createHash, randomBytes } from 'crypto';
import type { CookieOptions } from 'express';
import { Injectable } from '@nestjs/common';
import type { SessionUser } from '@todo/shared';
import { loadConfig } from '../../infra/config';
import type { TxClient } from '../../infra/db.service';
import { SessionsRepository } from './sessions.repository';
import { sessionCookieOptions } from './session.constants';

/** The result of issuing a session: the raw token for the cookie + the cookie
 * options to set it with. The raw token is never persisted. */
export interface IssuedSession {
  rawToken: string;
  cookieOptions: CookieOptions;
}

/**
 * Session lifecycle for the opaque-token model (ADR-005; FR-AUTH-016,
 * NFR-SEC-007). Issues a 256-bit random token, persists only its SHA-256 hash
 * with a long-lived expiry, and resolves a presented token back to its user
 * (touching last_used_at). Mirrors VerificationTokenService's hash-at-rest
 * convention. Cross-cutting (`common/authz`) — see SessionsRepository.
 */
@Injectable()
export class SessionService {
  constructor(private readonly sessions: SessionsRepository) {}

  /** SHA-256 hex of a raw token. */
  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** Create a session for `userId`; returns the raw token + cookie options. */
  async issue(userId: string): Promise<IssuedSession> {
    const cfg = loadConfig();
    const rawToken = randomBytes(32).toString('base64url');
    const ttlMs = cfg.sessionTtlDays * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.sessions.create(userId, this.hashToken(rawToken), expiresAt);
    return {
      rawToken,
      cookieOptions: sessionCookieOptions(cfg.cookieSecure, ttlMs),
    };
  }

  /** Resolve a presented raw token to its user, or null when no live session
   * matches. Touches last_used_at on a hit. */
  async resolve(rawToken: string): Promise<SessionUser | null> {
    if (!rawToken) {
      return null;
    }
    const match = await this.sessions.findLiveByTokenHash(
      this.hashToken(rawToken),
    );
    if (!match) {
      return null;
    }
    await this.sessions.touchLastUsed(match.sessionId);
    return { id: match.userId, email: match.email };
  }

  /** Revoke the session for a presented raw token (sign-out, FEAT-004).
   * Idempotent: an empty or unknown token is a no-op, never an error. */
  async revoke(rawToken: string): Promise<void> {
    if (!rawToken) {
      return;
    }
    await this.sessions.deleteByTokenHash(this.hashToken(rawToken));
  }

  /** Revoke ALL of a user's sessions — the "invalidate all" on password
   * change/reset (FR-AUTH-017) and account deletion (FR-DATA-005). Accepts a tx
   * client so it runs atomically with the credential change (FEAT-005). */
  async revokeAllForUser(userId: string, tx?: TxClient): Promise<void> {
    await this.sessions.deleteByUserId(userId, tx);
  }
}
