import { PasswordHasher } from './password-hasher';

// AC-5 (NFR-SEC-005): stored hash is Argon2id (never plaintext) and verifies.
describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces an Argon2id hash that is not the plaintext', async () => {
    const hash = await hasher.hash('9x!vQ2mLp0zR');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('9x!vQ2mLp0zR');
  });

  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hasher.hash('9x!vQ2mLp0zR');
    expect(await hasher.verify(hash, '9x!vQ2mLp0zR')).toBe(true);
    expect(await hasher.verify(hash, 'wrong-password')).toBe(false);
  });
});
