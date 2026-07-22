import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { loadConfig } from '../../infra/config';

export interface IssuedToken {
  /** The raw token — goes in the email link only, never stored. */
  raw: string;
  /** SHA-256(raw), hex — stored on the user row (technical-design D4). */
  hash: string;
  /** Expiry, now + configured TTL (NFR-SEC-004, default 24h). */
  expiresAt: Date;
}

/**
 * Issues single-use, time-limited verification tokens (FR-AUTH-005, NFR-SEC-004,
 * technical-design D4). The raw token is emailed; only its hash + expiry are
 * persisted, so a DB leak cannot reveal a live link. FEAT-002 verifies by hashing
 * the presented token and matching.
 */
@Injectable()
export class VerificationTokenService {
  /** SHA-256 hex of a raw token — shared by issue() and (later) verification. */
  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  issue(): IssuedToken {
    const raw = randomBytes(32).toString('base64url');
    const ttlHours = loadConfig().verificationTokenTtlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    return { raw, hash: this.hashToken(raw), expiresAt };
  }
}
