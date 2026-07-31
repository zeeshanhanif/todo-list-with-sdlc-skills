import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { UserTimeZoneService } from '../../common/preferences/user-timezone.service';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-015 T5 — SearchService: AC-7 (paging through a result set with no
// duplicates and no gaps) and AC-12 (the payload's own isOverdue agrees with
// the filter that selected it).
const providers = [
  SearchService,
  SearchRepository,
  UserTimeZoneService,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

describe('SearchService (integration)', () => {
  let db: DbService;
  let service: SearchService;
  const userIds: string[] = [];

  const freshUser = async (
    timezone: string | null = null,
  ): Promise<{ id: string; inbox: string }> => {
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, timezone) VALUES ($1, 'x', $2)
       RETURNING id`,
      [`searchsvc-${randomUUID()}@example.com`, timezone],
    );
    const id = u.rows[0].id;
    userIds.push(id);
    const l = await db.query<{ id: string }>(
      `INSERT INTO lists (owner_id, name, is_default, position)
       VALUES ($1, 'Inbox', true, 0) RETURNING id`,
      [id],
    );
    return { id, inbox: l.rows[0].id };
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    service = mod.get(SearchService);
  });

  afterEach(async () => {
    for (const id of userIds) {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    }
    userIds.length = 0;
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  it('AC-7: pages a 60-result set as 25/25/10, distinct and complete', async () => {
    const { id, inbox } = await freshUser();
    const values = Array.from(
      { length: 60 },
      (_, i) => `($1, $2, 'report ${i}')`,
    ).join(',');
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title) VALUES ${values}`,
      [id, inbox],
    );

    const seen: string[] = [];
    const sizes: number[] = [];
    const cursors: (string | null)[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 3; page++) {
      const res = await service.search(id, { q: 'report', limit: 25, cursor });
      sizes.push(res.results.length);
      cursors.push(res.nextCursor);
      seen.push(...res.results.map((r) => r.id));
      cursor = res.nextCursor ?? undefined;
    }

    expect(sizes).toEqual([25, 25, 10]);
    // The last page carries no cursor — offering one would invite a request
    // that returns nothing and reads as a bug (D4).
    expect(cursors.map((c) => c !== null)).toEqual([true, true, false]);
    // No duplicates, no gaps: the two properties keyset pagination exists for.
    expect(new Set(seen).size).toBe(60);
    expect(seen).toHaveLength(60);
  });

  it('AC-13: a task created mid-page neither duplicates nor hides a row', async () => {
    const { id, inbox } = await freshUser();
    // Distinct created_at values, so the order is decided by the sort key
    // rather than by whichever random uuid each row happened to get — the
    // property under test is about the CURSOR, and a fixture whose order is
    // unpredictable cannot show it.
    for (let i = 0; i < 6; i++) {
      await db.query(
        `INSERT INTO tasks (owner_id, list_id, title, created_at)
         VALUES ($1, $2, $3, now() - ($4 || ' minutes')::interval)`,
        [id, inbox, `report ${i}`, String(i)],
      );
    }

    const first = await service.search(id, { q: 'report', limit: 3 });
    expect(first.results.map((r) => r.title)).toEqual([
      'report 0',
      'report 1',
      'report 2',
    ]);

    // Someone adds a task between the two page requests. Under OFFSET this
    // shifts every later page by one: the reader sees one row twice and never
    // sees another. Keyset is anchored to a row, not to a count.
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title) VALUES ($1, $2, 'report new')`,
      [id, inbox],
    );

    const second = await service.search(id, {
      q: 'report',
      limit: 3,
      cursor: first.nextCursor ?? undefined,
    });

    // Page 2 is exactly the next three, unshifted...
    expect(second.results.map((r) => r.title)).toEqual([
      'report 3',
      'report 4',
      'report 5',
    ]);
    // ...no row from page 1 came back...
    const firstIds = first.results.map((r) => r.id);
    expect(second.results.filter((r) => firstIds.includes(r.id))).toEqual([]);
    // ...and the interloper, being newer than the cursor, is correctly above
    // this page rather than pushing anything off the end of it.
    expect(second.results.map((r) => r.title)).not.toContain('report new');
  });

  it('AC-2: results carry the list name and the full task payload', async () => {
    const { id, inbox } = await freshUser();
    const due = new Date(Date.now() + 3_600_000);
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, due_at, priority)
       VALUES ($1, $2, 'report with everything', $3::timestamptz, 'high')`,
      [id, inbox, due.toISOString()],
    );

    const res = await service.search(id, { q: 'report' });

    const [hit] = res.results;
    expect(hit).toMatchObject({
      listId: inbox,
      listName: 'Inbox',
      title: 'report with everything',
      completedAt: null,
      dueAt: due.toISOString(),
      priority: 'high',
      isOverdue: false,
    });
    // The two server-generated fields, asserted for shape rather than value:
    // a real id, and ISO-8601 UTC on the wire (NFR-LOC-001).
    expect(hit.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(hit.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    // ...and nothing beyond the contract rode along on the row.
    // `position` joined the contract in FEAT-014 (D8): SearchResult extends
    // TaskSummary and there is ONE mapper, so a search hit carries the field
    // even though nothing here sorts by it — search and the smart views are
    // cross-list and order by created_at / due_at. Updated toward the design,
    // not toward the code: the exhaustive key list is the point of this
    // assertion, so it tracks the contract when the contract changes.
    expect(Object.keys(hit).sort()).toEqual([
      'completedAt',
      'createdAt',
      'dueAt',
      'id',
      'isOverdue',
      'listId',
      'listName',
      'position',
      'priority',
      'title',
    ]);
  });

  it('AC-12: every task returned by status=overdue carries isOverdue: true', async () => {
    const { id, inbox } = await freshUser();
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, due_at) VALUES
         ($1, $2, 'late one', $3::timestamptz),
         ($1, $2, 'late two', $3::timestamptz),
         ($1, $2, 'not late', $4::timestamptz)`,
      [id, inbox, past, future],
    );

    const byStatus = await service.search(id, { status: 'overdue' });
    const byDue = await service.search(id, { due: 'overdue' });

    // The filter and the payload are the same fact, derived once (D5).
    expect(byStatus.results).toHaveLength(2);
    expect(byStatus.results.every((r) => r.isOverdue)).toBe(true);
    expect(byDue.results.map((r) => r.id).sort()).toEqual(
      byStatus.results.map((r) => r.id).sort(),
    );

    const all = await service.search(id, { status: 'active' });
    expect(
      all.results
        .filter((r) => r.isOverdue)
        .map((r) => r.title)
        .sort(),
    ).toEqual(['late one', 'late two']);
  });

  it("resolves the caller's stored zone, falling back to UTC (D1)", async () => {
    // A user whose zone is null must still get a working due filter — the
    // fallback is computed, never stored (FEAT-008 D2).
    const { id, inbox } = await freshUser(null);
    await db.query(
      `INSERT INTO tasks (owner_id, list_id, title, due_at)
       VALUES ($1, $2, 'no zone set', now() + interval '2 hours')`,
      [id, inbox],
    );

    await expect(service.search(id, { due: 'none' })).resolves.toMatchObject({
      results: [],
    });
    // ...and the task is findable through a zone-dependent bucket without error.
    const res = await service.search(id, { status: 'active' });
    expect(res.results.map((r) => r.title)).toEqual(['no zone set']);
  });
});
