import { createHash } from 'crypto';
import { VerificationTokenService } from './verification-token.service';

// AC-7 (FR-AUTH-005, NFR-SEC-004): issued token has raw != hash, hash = SHA-256(raw),
// and expiry ~ now + 24h.
describe('VerificationTokenService', () => {
  const svc = new VerificationTokenService();

  it('issues a token whose stored hash is SHA-256(raw), not the raw', () => {
    const { raw, hash } = svc.issue();
    expect(raw).toBeTruthy();
    expect(hash).not.toEqual(raw);
    expect(hash).toEqual(createHash('sha256').update(raw).digest('hex'));
  });

  it('sets expiry approximately 24h in the future', () => {
    const before = Date.now();
    const { expiresAt } = svc.issue();
    const expectedMs = 24 * 60 * 60 * 1000;
    const deltaFromExpected = expiresAt.getTime() - before - expectedMs;
    // within 5s tolerance for execution time
    expect(Math.abs(deltaFromExpected)).toBeLessThan(5000);
  });

  it('issues a distinct token each call', () => {
    expect(svc.issue().raw).not.toEqual(svc.issue().raw);
  });
});
