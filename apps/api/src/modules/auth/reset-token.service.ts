import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../infra/config';

export interface IssuedResetToken {
  /** The raw token — goes in the reset email link only, never stored. */
  raw: string;
  /** SHA-256(raw), hex — stored on the user row (technical-design §4). */
  hash: string;
  /** Expiry, now + configured TTL (NFR-SEC-004, default 1h). */
  expiresAt: Date;
}

/**
 * Issues single-use, time-limited password-reset tokens (FR-AUTH-013,
 * NFR-SEC-004; FEAT-005 technical-design D1). Mirrors VerificationTokenService
 * (opaque token, hash-at-rest) with the reset TTL. Parallel rather than folded
 * in, to avoid churning FEAT-002's verified verification service.
 */
@Injectable()
export class ResetTokenService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** SHA-256 hex of a raw token — shared by issue() and the reset lookup. */
  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  issue(): IssuedResetToken {
    const raw = randomBytes(32).toString('base64url');
    const ttlHours = this.config.resetTokenTtlHours;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    return { raw, hash: this.hashToken(raw), expiresAt };
  }
}
