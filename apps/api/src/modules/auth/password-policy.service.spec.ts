import { PASSWORD_MIN_LENGTH } from '@todo/shared';
import { PasswordPolicyService } from './password-policy.service';

// AC-4 (FR-AUTH-004, NFR-SEC-003): too-short and common passwords are rejected
// with a specific message; a compliant password is accepted. No DB needed.
describe('PasswordPolicyService', () => {
  const policy = new PasswordPolicyService();

  it('rejects a too-short password with a length requirement message', () => {
    const msg = policy.check('short'); // 5 chars < 10
    expect(msg).not.toBeNull();
    expect(msg).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it('rejects a common password even when long enough (case-insensitive)', () => {
    expect(policy.check('password123')).toMatch(/too common/i); // 11 chars, common
    expect(policy.check('QWERTYUIOP')).toMatch(/too common/i); // 10 chars, common, upper
  });

  it('accepts a compliant password (>= 10 chars, not common)', () => {
    expect(policy.check('9x!vQ2mLp0zR')).toBeNull();
    expect(policy.check('correct horse battery staple')).toBeNull();
  });
});
