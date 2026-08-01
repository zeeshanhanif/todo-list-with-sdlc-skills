import {
  ACCOUNT_EXPORT_FORMAT_VERSION,
  type AccountExportDocument,
} from '@todo/shared';
import { AccountExportService } from './account-export.service';
import type {
  AccountExportRepository,
  ExportRows,
} from './account-export.repository';
import {
  AccountNotFoundError,
  ExportIntegrityError,
} from './account-data.errors';

// FEAT-017 T3 — AccountExportService: AC-1 (document shape), AC-3 (completed vs
// active mapping), AC-7 (every timestamp ISO-8601 UTC and round-trippable),
// AC-8 (the account block, and what it must never carry), AC-9's mapping half.
// Unit tests — the repository is a stub, so what is under test is the mapping.

const AT = (iso: string): Date => new Date(iso);

const rows = (over: Partial<ExportRows> = {}): ExportRows => ({
  account: {
    email: 'sam@example.com',
    displayName: null,
    timezone: null,
    theme: 'system',
    createdAt: AT('2026-07-22T11:02:41.006Z'),
  },
  lists: [],
  tasks: [],
  ...over,
});

const list = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `List ${id}`,
  isDefault: false,
  position: 0,
  createdAt: AT('2026-07-22T11:02:41.006Z'),
  updatedAt: AT('2026-07-22T11:02:41.006Z'),
  ...over,
});

const task = (
  id: string,
  listId: string,
  over: Record<string, unknown> = {},
) => ({
  id,
  listId,
  title: `Task ${id}`,
  completedAt: null,
  dueAt: null,
  priority: 'none' as const,
  position: 0,
  createdAt: AT('2026-07-23T08:00:00.000Z'),
  updatedAt: AT('2026-07-23T08:00:00.000Z'),
  ...over,
});

const serviceOver = (result: ExportRows): AccountExportService =>
  new AccountExportService({
    readAll: () => Promise.resolve(result),
  } as unknown as AccountExportRepository);

/** Walk every string in the document — the only honest way to assert that
 * something is absent from a file a user will download. */
const allStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((v) => allStrings(v, out));
  return out;
};

describe('AccountExportService', () => {
  describe('document shape (AC-1, FR-DATA-001)', () => {
    it('AC-1: has exactly the four top-level keys, and formatVersion is 1', async () => {
      const doc = await serviceOver(rows()).export('u1');

      expect(Object.keys(doc).sort()).toEqual([
        'account',
        'exportedAt',
        'formatVersion',
        'lists',
      ]);
      expect(doc.formatVersion).toBe(1);
      expect(doc.formatVersion).toBe(ACCOUNT_EXPORT_FORMAT_VERSION);
    });

    it('AC-1: survives a JSON round trip unchanged — it is a file, not a view model', async () => {
      const doc = await serviceOver(
        rows({ lists: [list('l1')], tasks: [task('t1', 'l1')] }),
      ).export('u1');

      expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
    });

    it('throws AccountNotFoundError when the account row is gone', async () => {
      await expect(
        serviceOver(rows({ account: null })).export('u1'),
      ).rejects.toBeInstanceOf(AccountNotFoundError);
    });
  });

  describe('the account block (AC-8, FR-DATA-001, NFR-COMP-001)', () => {
    it('AC-8: carries the stored display name — null stays null, NOT the email-derived default (D4)', async () => {
      const doc = await serviceOver(rows()).export('u1');

      expect(doc.account.displayName).toBeNull();
      // The derived fallback would have been "sam" — writing it down would
      // record a preference the user never expressed.
      expect(doc.account.displayName).not.toBe('sam');
    });

    it('AC-8: carries a set display name verbatim', async () => {
      const base = rows();
      const doc = await serviceOver({
        ...base,
        account: {
          ...base.account!,
          displayName: 'Sam',
          timezone: 'Asia/Calcutta',
        },
      }).export('u1');

      expect(doc.account.displayName).toBe('Sam');
      expect(doc.account.timezone).toBe('Asia/Calcutta');
    });

    it('AC-8: never carries credentials or security state', async () => {
      const doc = await serviceOver(
        rows({ lists: [list('l1')], tasks: [task('t1', 'l1')] }),
      ).export('u1');

      const serialized = JSON.stringify(doc);
      for (const forbidden of [
        'password',
        'passwordHash',
        'password_hash',
        'token',
        'tokenHash',
        'failedLoginCount',
        'failed_login_count',
        'lockedUntil',
        'locked_until',
        'verifiedAt',
        'verified_at',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(Object.keys(doc.account).sort()).toEqual([
        'createdAt',
        'displayName',
        'email',
        'theme',
        'timezone',
      ]);
    });
  });

  describe('lists and tasks (AC-3, FR-DATA-002)', () => {
    it('AC-3: nests each task under its list, in the order the rows arrived', async () => {
      const doc = await serviceOver(
        rows({
          lists: [list('l1', { name: 'Inbox', isDefault: true }), list('l2')],
          tasks: [
            task('t1', 'l1', { title: 'First' }),
            task('t2', 'l1', { title: 'Second', position: 1 }),
            task('t3', 'l2', { title: 'Elsewhere' }),
          ],
        }),
      ).export('u1');

      expect(doc.lists.map((l) => l.id)).toEqual(['l1', 'l2']);
      expect(doc.lists[0].tasks.map((t) => t.title)).toEqual([
        'First',
        'Second',
      ]);
      expect(doc.lists[1].tasks.map((t) => t.title)).toEqual(['Elsewhere']);
    });

    it('AC-2: a list with no tasks gets an empty array, not a missing key', async () => {
      const doc = await serviceOver(rows({ lists: [list('l1')] })).export('u1');

      expect(doc.lists[0].tasks).toEqual([]);
      expect('tasks' in doc.lists[0]).toBe(true);
    });

    it('AC-3: a completed task carries an ISO completedAt; an active one carries null', async () => {
      const doc = await serviceOver(
        rows({
          lists: [list('l1')],
          tasks: [
            task('t1', 'l1'),
            task('t2', 'l1', { completedAt: AT('2026-07-30T14:00:00.000Z') }),
          ],
        }),
      ).export('u1');

      expect(doc.lists[0].tasks[0].completedAt).toBeNull();
      expect(doc.lists[0].tasks[1].completedAt).toBe(
        '2026-07-30T14:00:00.000Z',
      );
    });

    it('D3: each task repeats its listId so it stays self-describing out of the tree', async () => {
      const doc = await serviceOver(
        rows({ lists: [list('l1')], tasks: [task('t1', 'l1')] }),
      ).export('u1');

      expect(doc.lists[0].tasks[0].listId).toBe('l1');
    });

    it('omits isOverdue and any derived status field (§3.2)', async () => {
      const doc = await serviceOver(
        rows({ lists: [list('l1')], tasks: [task('t1', 'l1')] }),
      ).export('u1');

      expect(Object.keys(doc.lists[0].tasks[0]).sort()).toEqual([
        'completedAt',
        'createdAt',
        'dueAt',
        'id',
        'listId',
        'position',
        'priority',
        'title',
        'updatedAt',
      ]);
    });
  });

  describe('timestamps (AC-7, NFR-LOC-001)', () => {
    it('AC-7: every timestamp is null or an ISO-8601 Z string that round-trips', async () => {
      const doc = await serviceOver(
        rows({
          lists: [list('l1')],
          tasks: [
            task('t1', 'l1', {
              dueAt: AT('2026-08-02T09:00:00.000Z'),
              completedAt: AT('2026-07-30T14:00:00.000Z'),
            }),
          ],
        }),
      ).export('u1');

      const stamps = [
        doc.exportedAt,
        doc.account.createdAt,
        doc.lists[0].createdAt,
        doc.lists[0].updatedAt,
        doc.lists[0].tasks[0].createdAt,
        doc.lists[0].tasks[0].updatedAt,
        doc.lists[0].tasks[0].dueAt,
        doc.lists[0].tasks[0].completedAt,
      ];

      for (const stamp of stamps) {
        expect(stamp).not.toBeNull();
        expect(stamp!).toMatch(/Z$/);
        expect(new Date(stamp!).toISOString()).toBe(stamp);
      }
    });

    it('AC-7: exportedAt is stamped at export time', async () => {
      const before = Date.now();
      const doc = await serviceOver(rows()).export('u1');
      const after = Date.now();

      const at = new Date(doc.exportedAt).getTime();
      expect(at).toBeGreaterThanOrEqual(before);
      expect(at).toBeLessThanOrEqual(after);
    });
  });

  describe('snapshot integrity (AC-9 mapping half)', () => {
    it('AC-9: a task whose list is absent throws rather than vanishing from the file', async () => {
      await expect(
        serviceOver(
          rows({ lists: [list('l1')], tasks: [task('t9', 'ghost-list')] }),
        ).export('u1'),
      ).rejects.toBeInstanceOf(ExportIntegrityError);
    });

    it('AC-9: no phantom list is invented for an orphan task', async () => {
      let doc: AccountExportDocument | undefined;
      try {
        doc = await serviceOver(
          rows({ lists: [list('l1')], tasks: [task('t9', 'ghost-list')] }),
        ).export('u1');
      } catch {
        // expected
      }

      expect(doc).toBeUndefined();
    });

    it('AC-9: every task in the document reports the list it is nested under', async () => {
      const doc = await serviceOver(
        rows({
          lists: [list('l1'), list('l2')],
          tasks: [task('t1', 'l1'), task('t2', 'l2')],
        }),
      ).export('u1');

      for (const l of doc.lists) {
        for (const t of l.tasks) {
          expect(t.listId).toBe(l.id);
        }
      }
      expect(allStrings(doc)).toContain('Task t2');
    });
  });
});
