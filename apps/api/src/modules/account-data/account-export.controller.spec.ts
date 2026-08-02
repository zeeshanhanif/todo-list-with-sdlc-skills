import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  ACCOUNT_EXPORT_PATH,
  accountExportFilename,
  type AccountExportDocument,
  type ApiError,
} from '@todo/shared';
import { AppModule } from '../../app.module';
import { configureApp } from '../../app-setup';
import { DbService } from '../../infra/db.service';
import { AuditService } from '../../common/audit/audit.service';

// Contract tests: boot the real app (global pipe + filter + cookie-parser) and
// drive POST /account/export over HTTP. Needs local Postgres.
// FEAT-017 T4 — AC-1 (200, unwrapped body), AC-5 (two accounts export disjoint
// documents), AC-6 (401 on missing/expired/revoked cookies), AC-11 (the audit
// row, and that its failure cannot fail the export), AC-12's server half (the
// Content-Disposition filename in the USER's zone).
const VALID_PW = '9x!vQ2mLp0zR';

describe('account export endpoint (contract)', () => {
  let app: INestApplication;
  let db: DbService;
  let audit: AuditService;
  const emails: string[] = [];
  let ipCounter = 0;

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];
  // A disjoint /24 from the other suites' ranges — DEF-001's isolation rule.
  const nextIp = (): string => `198.18.24.${(ipCounter++ % 250) + 1}`;

  const freshEmail = (): string => {
    const e = `exportc-${randomUUID()}@example.com`;
    emails.push(e);
    return e;
  };

  /** Register + verify + sign in; returns the session cookie, id and Inbox id. */
  const signedInUser = async (): Promise<{
    cookie: string;
    id: string;
    email: string;
    inbox: string;
  }> => {
    const email = freshEmail();
    const reg = await request(server())
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    expect(reg.status).toBe(201); // fixture must be real before anything is read
    await db.query('UPDATE users SET verified_at = now() WHERE email = $1', [
      email,
    ]);
    const res = await request(server())
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: VALID_PW });
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const row = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    const id = row.rows[0].id;
    const inbox = await db.query<{ id: string }>(
      'SELECT id FROM lists WHERE owner_id = $1 AND is_default = true',
      [id],
    );
    return {
      cookie: setCookie[0].split(';')[0],
      id,
      email,
      inbox: inbox.rows[0].id,
    };
  };

  const seedTask = async (
    ownerId: string,
    listId: string,
    title: string,
    completed = false,
  ): Promise<void> => {
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, completed_at)
       VALUES ($1, $2, $3, ${completed ? 'now()' : 'NULL'})`,
      [ownerId, listId, title],
    );
  };

  const exportFor = (cookie: string) =>
    request(server()).post(ACCOUNT_EXPORT_PATH).set('Cookie', cookie);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DbService);
    audit = app.get(AuditService);
  });

  afterEach(async () => {
    for (const email of emails) {
      await db.query('DELETE FROM users WHERE email = $1', [email]);
    }
    emails.length = 0;
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('the success response (AC-1, FR-DATA-001)', () => {
    it('AC-1: 200 with the document as the body — no envelope around it (D2)', async () => {
      const user = await signedInUser();
      await seedTask(user.id, user.inbox, 'Buy milk');

      const res = await exportFor(user.cookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      const doc = res.body as AccountExportDocument;
      // The document is at the TOP level: no `export`, no `data`, no wrapper.
      expect(Object.keys(doc).sort()).toEqual([
        'account',
        'exportedAt',
        'formatVersion',
        'lists',
      ]);
      expect(doc.formatVersion).toBe(1);
      expect(doc.account.email).toBe(user.email);
      expect(doc.lists).toHaveLength(1);
      expect(doc.lists[0].isDefault).toBe(true);
      expect(doc.lists[0].tasks.map((t) => t.title)).toEqual(['Buy milk']);
    });

    it('AC-2/AC-3: a fresh account exports its Inbox with no tasks', async () => {
      const user = await signedInUser();

      const res = await exportFor(user.cookie);

      expect(res.status).toBe(200);
      const doc = res.body as AccountExportDocument;
      expect(doc.lists).toHaveLength(1);
      expect(doc.lists[0].tasks).toEqual([]);
    });

    it('AC-3/AC-4: completed tasks are in; soft-deleted ones are not', async () => {
      const user = await signedInUser();
      await seedTask(user.id, user.inbox, 'Active', false);
      await seedTask(user.id, user.inbox, 'Completed', true);
      await seedTask(user.id, user.inbox, 'Trashed', false);
      await db.query(
        `UPDATE tasks SET deleted_at = now() WHERE owner_id = $1 AND title = 'Trashed'`,
        [user.id],
      );

      const res = await exportFor(user.cookie);

      const titles = (res.body as AccountExportDocument).lists[0].tasks.map(
        (t) => t.title,
      );
      expect(titles.sort()).toEqual(['Active', 'Completed']);
      expect(JSON.stringify(res.body)).not.toContain('Trashed');
    });

    it('is repeatable — a second export returns the same data (idempotent, §3.1)', async () => {
      const user = await signedInUser();
      await seedTask(user.id, user.inbox, 'Buy milk');

      const first = (await exportFor(user.cookie))
        .body as AccountExportDocument;
      const second = (await exportFor(user.cookie))
        .body as AccountExportDocument;

      expect({ ...second, exportedAt: first.exportedAt }).toEqual(first);
    });
  });

  describe('ownership (AC-5, FR-AUTHZ-002/003)', () => {
    it("AC-5: another account's ids, list names and titles appear nowhere in the body", async () => {
      const mine = await signedInUser();
      const theirs = await signedInUser();
      await db.query(
        `INSERT INTO lists (owner_id, name, position) VALUES ($1, 'Their secret list', 1)`,
        [theirs.id],
      );
      await seedTask(theirs.id, theirs.inbox, 'Their secret task');
      await seedTask(mine.id, mine.inbox, 'My task');

      const res = await exportFor(mine.cookie);

      // Asserted over the SERIALIZED body, so a stray id anywhere in the
      // document — nested, in a key, in a list — fails.
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(theirs.id);
      expect(serialized).not.toContain(theirs.inbox);
      expect(serialized).not.toContain(theirs.email);
      expect(serialized).not.toContain('Their secret list');
      expect(serialized).not.toContain('Their secret task');
      expect(serialized).toContain('My task');
    });
  });

  describe('authentication (AC-6, FR-AUTHZ-001)', () => {
    it('AC-6: 401 unauthenticated with no cookie, and no data in the body', async () => {
      const res = await request(server()).post(ACCOUNT_EXPORT_PATH);

      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('unauthenticated');
      expect(JSON.stringify(res.body)).not.toContain('lists');
    });

    it('AC-6: 401 for a garbage cookie', async () => {
      const res = await exportFor('todo_session=not-a-real-token');

      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('unauthenticated');
    });

    it('AC-6: 401 after the session is revoked by signing out', async () => {
      const user = await signedInUser();
      expect((await exportFor(user.cookie)).status).toBe(200);

      await request(server())
        .post('/auth/logout')
        .set('Cookie', user.cookie)
        .expect(200);

      const res = await exportFor(user.cookie);
      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('unauthenticated');
    });

    it('AC-6: 401 for an expired session', async () => {
      const user = await signedInUser();
      await db.query(
        `UPDATE sessions SET expires_at = now() - interval '1 hour' WHERE user_id = $1`,
        [user.id],
      );

      const res = await exportFor(user.cookie);

      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('unauthenticated');
    });
  });

  describe('the filename header (AC-12 server half, D5)', () => {
    it("AC-12: Content-Disposition carries the date in the USER's zone", async () => {
      const user = await signedInUser();
      // Kiritimati is +14:00 — the furthest-ahead zone there is, so its local
      // date differs from UTC's for two hours of every day. Deriving the
      // filename in UTC would be visibly wrong for this user.
      await db.query(`UPDATE users SET timezone = $1 WHERE id = $2`, [
        'Pacific/Kiritimati',
        user.id,
      ]);

      const res = await exportFor(user.cookie);

      const doc = res.body as AccountExportDocument;
      const expected = accountExportFilename(
        doc.exportedAt,
        'Pacific/Kiritimati',
      );
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="${expected}"`,
      );
      expect(res.headers['content-disposition']).toMatch(
        /todo-export-\d{4}-\d{2}-\d{2}\.json/,
      );
    });

    it('AC-12: falls back to UTC when the user has no timezone set', async () => {
      const user = await signedInUser();

      const res = await exportFor(user.cookie);

      const doc = res.body as AccountExportDocument;
      expect(doc.account.timezone).toBeNull();
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="${accountExportFilename(doc.exportedAt, 'UTC')}"`,
      );
    });
  });

  describe('the audit trail (AC-11, NFR-SEC-009, D6)', () => {
    it('AC-11: appends exactly one data_exported row, carrying the user id and nothing else', async () => {
      const user = await signedInUser();
      await seedTask(user.id, user.inbox, 'A very private task title');

      await exportFor(user.cookie).expect(200);

      const rows = await db.query<{ detail: unknown; ip: string | null }>(
        `SELECT detail, ip FROM audit_log
          WHERE user_id = $1 AND event = 'data_exported'`,
        [user.id],
      );
      expect(rows.rowCount).toBe(1);
      // The log must never become a second copy of the data it protects.
      expect(JSON.stringify(rows.rows[0])).not.toContain(
        'A very private task title',
      );
      expect(rows.rows[0].detail).toBeNull();
    });

    it('AC-11: two exports append two rows', async () => {
      const user = await signedInUser();

      await exportFor(user.cookie).expect(200);
      await exportFor(user.cookie).expect(200);

      const rows = await db.query(
        `SELECT 1 FROM audit_log WHERE user_id = $1 AND event = 'data_exported'`,
        [user.id],
      );
      expect(rows.rowCount).toBe(2);
    });

    it('AC-11: an audit write that throws still returns 200 with the document', async () => {
      const user = await signedInUser();
      await seedTask(user.id, user.inbox, 'Still exported');
      // Reach past AuditService's own swallow, so the failure really would
      // propagate if the controller awaited it unguarded.
      jest
        .spyOn(audit, 'record')
        .mockRejectedValue(new Error('audit log unavailable'));

      const res = await exportFor(user.cookie);

      expect(res.status).toBe(200);
      expect(
        (res.body as AccountExportDocument).lists[0].tasks.map((t) => t.title),
      ).toEqual(['Still exported']);
    });
  });
});
