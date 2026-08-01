import { AUDIT_EVENTS } from '../../common/audit/audit.service';
import { AccountDeleteService } from './account-delete.service';
import {
  AccountNotFoundError,
  CurrentPasswordInvalidError,
} from './account-data.errors';

// FEAT-018 T4 — AccountDeleteService: AC-5's service half (a wrong password
// deletes nothing), AC-11 (the account_deleted row, and audit failure not
// breaking the deletion), AC-12 (the account_delete_failure row), plus the
// concurrent-delete case. Unit tests — the repository, hasher and audit log are
// stubs, so what is under test is the ORDER, which is the design.

const USER = '11111111-1111-4111-8111-111111111111';

type Harness = {
  service: AccountDeleteService;
  findCredential: jest.Mock;
  deleteAccount: jest.Mock;
  verify: jest.Mock;
  record: jest.Mock;
};

const harness = (): Harness => {
  const findCredential = jest.fn().mockResolvedValue({ passwordHash: 'hash' });
  const deleteAccount = jest.fn().mockResolvedValue(true);
  const verify = jest.fn().mockResolvedValue(true);
  const record = jest.fn().mockResolvedValue(undefined);

  const service = new AccountDeleteService(
    { findCredential, deleteAccount } as never,
    { verify, hash: jest.fn() } as never,
    { record } as never,
  );
  return { service, findCredential, deleteAccount, verify, record };
};

const run = (h: Harness, ip: string | null = '203.0.113.7') =>
  h.service.delete({ userId: USER, currentPassword: 'pw', ip });

describe('AccountDeleteService', () => {
  describe('the happy path (FR-DATA-003; UC-016 main 3-4)', () => {
    it('verifies the stored hash against the submitted password, then deletes', async () => {
      const h = harness();

      await run(h);

      expect(h.verify).toHaveBeenCalledWith('hash', 'pw');
      expect(h.deleteAccount).toHaveBeenCalledWith(USER);
    });

    it('AC-11: records exactly one account_deleted row, with the id in detail and user_id null', async () => {
      const h = harness();

      await run(h);

      const deletions = h.record.mock.calls.filter(
        ([event]) => event === AUDIT_EVENTS.accountDeleted,
      );
      expect(deletions).toHaveLength(1);
      expect(deletions[0][1]).toEqual({
        userId: null,
        ip: '203.0.113.7',
        detail: { userId: USER },
      });
      // The address the deletion just released must not survive in the log.
      expect(JSON.stringify(deletions[0][1])).not.toContain('@');
    });

    it('AC-11: writes the audit row AFTER the delete transaction commits', async () => {
      const order: string[] = [];
      const h = harness();
      h.deleteAccount.mockImplementation(async () => {
        order.push('delete');
        return true;
      });
      h.record.mockImplementation(async (event: string) => {
        order.push(`audit:${event}`);
      });

      await run(h);

      // Not cosmetic: a row inserted before the delete would name a user the
      // cascade is about to blank, and one inserted with that id after the
      // delete would violate the FK (technical-design D6).
      expect(order).toEqual(['delete', `audit:${AUDIT_EVENTS.accountDeleted}`]);
    });

    it('AC-11: an audit-write failure still leaves the account deleted', async () => {
      const h = harness();
      h.record.mockRejectedValue(new Error('audit table on fire'));

      await expect(run(h)).resolves.toBeUndefined();
      expect(h.deleteAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe('a wrong password (FR-DATA-004; UC-016 alt 3a)', () => {
    it('AC-5: throws CurrentPasswordInvalidError and deletes nothing', async () => {
      const h = harness();
      h.verify.mockResolvedValue(false);

      await expect(run(h)).rejects.toBeInstanceOf(CurrentPasswordInvalidError);

      expect(h.deleteAccount).not.toHaveBeenCalled();
    });

    it('AC-12: records exactly one account_delete_failure carrying the user id and a reason category', async () => {
      const h = harness();
      h.verify.mockResolvedValue(false);

      await expect(run(h)).rejects.toThrow();

      const failures = h.record.mock.calls.filter(
        ([event]) => event === AUDIT_EVENTS.accountDeleteFailure,
      );
      expect(failures).toHaveLength(1);
      expect(failures[0][1]).toEqual({
        userId: USER,
        ip: '203.0.113.7',
        detail: { reason: 'wrong_password' },
      });
      // Never the submitted password, in any field.
      expect(JSON.stringify(failures[0][1])).not.toContain('pw');
      expect(
        h.record.mock.calls.some(
          ([event]) => event === AUDIT_EVENTS.accountDeleted,
        ),
      ).toBe(false);
    });
  });

  describe('the account is already gone', () => {
    it('throws AccountNotFoundError when no credential row exists, without verifying or deleting', async () => {
      const h = harness();
      h.findCredential.mockResolvedValue(null);

      await expect(run(h)).rejects.toBeInstanceOf(AccountNotFoundError);

      expect(h.verify).not.toHaveBeenCalled();
      expect(h.deleteAccount).not.toHaveBeenCalled();
      expect(h.record).not.toHaveBeenCalled();
    });

    it('throws AccountNotFoundError when the delete removed no row (a concurrent second delete), and records no deletion', async () => {
      const h = harness();
      h.deleteAccount.mockResolvedValue(false);

      await expect(run(h)).rejects.toBeInstanceOf(AccountNotFoundError);

      expect(
        h.record.mock.calls.some(
          ([event]) => event === AUDIT_EVENTS.accountDeleted,
        ),
      ).toBe(false);
    });
  });
});
