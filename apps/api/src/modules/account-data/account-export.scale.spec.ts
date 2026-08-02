import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { AccountExportRepository } from './account-export.repository';
import { AccountExportService } from './account-export.service';

// FEAT-017 T8 — AC-10, the criterion technical-design D9 rests on.
//
// D9 declined UC-015's background path (alt 2a) on the argument that at the
// NFR-SCAL-002 ceiling the export is a sub-second read, not a job. That is a
// claim about behaviour at a stated scale, so it is measured here rather than
// asserted in prose: if this budget is ever broken, 2a is the designed escape
// hatch and it re-enters through an architecture amendment.
const providers = [
  AccountExportService,
  AccountExportRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

// NFR-SCAL-002: "a user holding up to 100 lists and 5,000 tasks".
const LISTS = 100;
const TASKS = 5_000;
const BUDGET_MS = 2_000;

describe('AccountExportService at the NFR-SCAL-002 ceiling (integration)', () => {
  let db: DbService;
  let service: AccountExportService;
  let userId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    service = mod.get(AccountExportService);

    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`exportscale-${randomUUID()}@example.com`],
    );
    userId = u.rows[0].id;

    // 100 lists, then 5,000 tasks spread across them — set-based so the
    // fixture itself doesn't dominate the run.
    await db.query(
      `INSERT INTO lists (owner_id, name, is_default, position)
       SELECT $1, 'List ' || g, g = 0, g
         FROM generate_series(0, $2::int - 1) AS g`,
      [userId, LISTS],
    );
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, position, due_at, completed_at)
       SELECT $1,
              l.id,
              'Task ' || g,
              g,
              CASE WHEN g % 3 = 0 THEN now() + (g || ' minutes')::interval END,
              CASE WHEN g % 5 = 0 THEN now() END
         FROM generate_series(0, $2::int - 1) AS g
         JOIN LATERAL (
           SELECT id FROM lists
            WHERE owner_id = $1
            ORDER BY position
            OFFSET g % $3::int LIMIT 1
         ) AS l ON true`,
      [userId, TASKS, LISTS],
    );
  }, 60_000);

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await db.onModuleDestroy();
  });

  it('AC-10: returns one complete document within the budget', async () => {
    const started = Date.now();
    const doc = await service.export(userId);
    const elapsed = Date.now() - started;

    // Complete first — a fast export that lost rows would be worse than a slow
    // one, so the count is asserted before the clock.
    expect(doc.lists).toHaveLength(LISTS);
    const exported = doc.lists.reduce((n, l) => n + l.tasks.length, 0);
    expect(exported).toBe(TASKS);

    // Logged before the assertion so the measurement is on the record whether
    // it passes or fails — a budget test that only speaks when it breaks tells
    // you nothing about the margin you are running on.

    console.log(
      `AC-10: ${LISTS} lists / ${TASKS} tasks exported in ${elapsed} ms ` +
        `(budget ${BUDGET_MS} ms); serialized ${(
          JSON.stringify(doc).length /
          1024 /
          1024
        ).toFixed(2)} MB`,
    );

    // Jest's expect takes exactly one argument (unlike Playwright's), so the
    // context lives in the log line above rather than in a message parameter.
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 30_000);

  it('AC-10: every task is nested under the list that owns it, at scale', async () => {
    const doc = await service.export(userId);

    for (const list of doc.lists) {
      for (const t of list.tasks) {
        expect(t.listId).toBe(list.id);
      }
    }
  }, 30_000);
});
