import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { SearchRepository } from './search.repository';
import { parseCriteria, type RawSearchQuery } from './search.criteria';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-015 T4 — SearchRepository: AC-1 (case-insensitive substring across every
// list the caller owns), AC-2 (listName present; soft-deleted never reachable),
// AC-3 (the three status sets), AC-4 (buckets in the USER'S zone), AC-5
// (conjunctive), AC-12 (status=overdue and due=overdue are the same set).
const providers = [
  SearchRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

const NEW_YORK = 'America/New_York';
const CALCUTTA = 'Asia/Calcutta';

describe('SearchRepository (integration)', () => {
  let db: DbService;
  let repo: SearchRepository;
  const userIds: string[] = [];

  const freshUser = async (): Promise<{ id: string; inbox: string }> => {
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`searchrepo-${randomUUID()}@example.com`],
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

  const addList = async (ownerId: string, name: string): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO lists (owner_id, name, position)
       VALUES ($1, $2, (SELECT COALESCE(MAX(position)+1,0) FROM lists WHERE owner_id = $1))
       RETURNING id`,
      [ownerId, name],
    );
    return r.rows[0].id;
  };

  /** Seed one task with full control over the columns search reads. */
  const seed = async (
    ownerId: string,
    listId: string,
    title: string,
    opts: {
      dueAt?: string | null;
      completed?: boolean;
      deleted?: boolean;
      createdAt?: string;
    } = {},
  ): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO tasks (owner_id, list_id, title, due_at, completed_at, deleted_at, created_at)
       VALUES ($1, $2, $3, $4::timestamptz,
               ${opts.completed ? 'now()' : 'NULL'},
               ${opts.deleted ? 'now()' : 'NULL'},
               COALESCE($5::timestamptz, now()))
       RETURNING id`,
      [ownerId, listId, title, opts.dueAt ?? null, opts.createdAt ?? null],
    );
    return r.rows[0].id;
  };

  /** Run a search the way the endpoint will: through the criteria parser. */
  const search = async (
    ownerId: string,
    raw: RawSearchQuery,
    tz = 'UTC',
  ): Promise<string[]> => {
    const { rows } = await repo.search(ownerId, parseCriteria(raw), tz);
    return rows.map((r) => r.title);
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    repo = mod.get(SearchRepository);
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

  describe('keyword matching (FR-SRCH-001)', () => {
    it('AC-1: matches case-insensitively, as a substring, across every list', async () => {
      const { id, inbox } = await freshUser();
      const work = await addList(id, 'Work');
      await seed(id, inbox, 'Quarterly REPORT draft');
      await seed(id, work, 'report to the board');
      await seed(id, inbox, 'Buy milk');

      const titles = await search(id, { q: 'report' });

      expect(titles.sort()).toEqual([
        'Quarterly REPORT draft',
        'report to the board',
      ]);
    });

    it('AC-1: matches a substring inside a word, not just a prefix', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'Quarterly report');

      await expect(search(id, { q: 'por' })).resolves.toEqual([
        'Quarterly report',
      ]);
    });

    it('AC-14: a term of % matches a literal percent sign, not everything', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'Save 50% on renewal');
      await seed(id, inbox, 'Nothing special here');

      // The whole point of D8: an unescaped % would return both rows.
      await expect(search(id, { q: '%' })).resolves.toEqual([
        'Save 50% on renewal',
      ]);
    });

    it('AC-14: a term of _ matches a literal underscore, not any character', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'deploy_v2 checklist');
      await seed(id, inbox, 'deploy-v2 checklist');

      await expect(search(id, { q: 'deploy_v2' })).resolves.toEqual([
        'deploy_v2 checklist',
      ]);
    });
  });

  describe('result shape and exclusions (FR-SRCH-002)', () => {
    it('AC-2: every result carries the name of the list holding it', async () => {
      const { id, inbox } = await freshUser();
      const work = await addList(id, 'Work');
      await seed(id, inbox, 'inbox report');
      await seed(id, work, 'work report');

      const { rows } = await repo.search(
        id,
        parseCriteria({ q: 'report' }),
        'UTC',
      );

      expect(rows.map((r) => [r.title, r.listName]).sort()).toEqual([
        ['inbox report', 'Inbox'],
        ['work report', 'Work'],
      ]);
    });

    it('AC-2: a soft-deleted match is unreachable under EVERY parameter combination', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'deleted report', {
        deleted: true,
        dueAt: new Date(Date.now() - 3_600_000).toISOString(),
      });

      for (const raw of [
        { q: 'report' },
        { q: 'deleted' },
        { status: 'active' },
        { status: 'completed' },
        { status: 'overdue' },
        { due: 'today' },
        { due: 'upcoming' },
        { due: 'overdue' },
        { due: 'none' },
        { q: 'report', status: 'overdue', due: 'overdue' },
      ] as RawSearchQuery[]) {
        await expect(search(id, raw)).resolves.toEqual([]);
      }
    });

    it("AC-8: another user's matching task never appears", async () => {
      const mine = await freshUser();
      const theirs = await freshUser();
      await seed(theirs.id, theirs.inbox, 'their secret report');
      await seed(mine.id, mine.inbox, 'my report');

      await expect(search(mine.id, { q: 'report' })).resolves.toEqual([
        'my report',
      ]);
    });
  });

  describe('status filter (FR-SRCH-003)', () => {
    const fixture = async () => {
      const { id, inbox } = await freshUser();
      const past = new Date(Date.now() - 3_600_000).toISOString();
      const future = new Date(Date.now() + 3_600_000).toISOString();
      await seed(id, inbox, 'active no due');
      await seed(id, inbox, 'active future due', { dueAt: future });
      await seed(id, inbox, 'active past due', { dueAt: past });
      await seed(id, inbox, 'completed', { completed: true });
      await seed(id, inbox, 'completed past due', {
        completed: true,
        dueAt: past,
      });
      return id;
    };

    it('AC-3: status=active returns exactly the incomplete tasks', async () => {
      const id = await fixture();
      expect((await search(id, { status: 'active' })).sort()).toEqual([
        'active future due',
        'active no due',
        'active past due',
      ]);
    });

    it('AC-3: status=completed returns exactly the completed tasks', async () => {
      const id = await fixture();
      expect((await search(id, { status: 'completed' })).sort()).toEqual([
        'completed',
        'completed past due',
      ]);
    });

    it('AC-3: status=overdue is active AND past due — a completed past-due task is not overdue', async () => {
      const id = await fixture();
      await expect(search(id, { status: 'overdue' })).resolves.toEqual([
        'active past due',
      ]);
    });
  });

  describe("due buckets in the user's timezone (FR-SRCH-004, FR-PROF-003)", () => {
    /**
     * One instant, two zones, two different calendar days — **at any hour the
     * suite happens to run**.
     *
     * Naming two fixed zones does not work: whether a given instant straddles
     * midnight between, say, New York and Calcutta depends on the wall-clock
     * hour, so a hardcoded pair passes in the morning and fails at night. (It
     * did: the first version of this test asserted New York/Calcutta and went
     * red once Calcutta crossed midnight.)
     *
     * The property AC-4 actually claims is *the stored zone decides the
     * bucket*, so the fixture derives its zones from the clock instead of
     * assuming them. A task due **12 hours from now** falls on today's date in
     * any zone whose local time is currently well before noon, and on
     * tomorrow's in any zone well past it.
     *
     * The margins (before 10:00 / after 14:00 rather than either side of noon)
     * absorb a DST transition: on a spring-forward day the local clock advances
     * 13 hours across 12 real ones, which would flip a fixture pinned exactly
     * at noon. The six zones' offsets are never more than 7 hours apart around
     * the circle, so a 10-hour-wide window always contains one of them —
     * meaning both kinds exist at every instant, DST or not.
     */
    const zoneCurrentlyEarly = async (): Promise<string> => selectZone(true);
    const zoneCurrentlyLate = async (): Promise<string> => selectZone(false);

    const CANDIDATES = [
      'Pacific/Kiritimati', // +14
      'Asia/Tokyo', // +9
      'Asia/Calcutta', // +5:30
      'Europe/London', // +0/+1
      'America/New_York', // -4/-5
      'Pacific/Midway', // -11
    ];

    const selectZone = async (early: boolean): Promise<string> => {
      const res = await db.query<{ zone: string; hour: number }>(
        `SELECT z AS zone, EXTRACT(HOUR FROM (now() AT TIME ZONE z))::int AS hour
           FROM unnest($1::text[]) AS z`,
        [CANDIDATES],
      );
      const match = res.rows.find((r) => (early ? r.hour < 10 : r.hour >= 14));
      if (!match) {
        throw new Error(
          `no candidate zone is currently ${early ? 'before 10:00' : 'after 14:00'} — impossible, since the zones' offsets are never more than 7 hours apart`,
        );
      }
      return match.zone;
    };

    it('AC-4: the same task is `today` in one zone and `upcoming` in another', async () => {
      const { id, inbox } = await freshUser();
      const due = new Date(Date.now() + 12 * 3_600_000);
      await seed(id, inbox, 'straddles midnight', { dueAt: due.toISOString() });

      const todayZone = await zoneCurrentlyEarly();
      const upcomingZone = await zoneCurrentlyLate();

      // Same row, same column, same instant. The zone is the only difference —
      // which is the whole of FR-SRCH-004's "computed in the user's timezone".
      expect(await search(id, { due: 'today' }, todayZone)).toEqual([
        'straddles midnight',
      ]);
      expect(await search(id, { due: 'upcoming' }, todayZone)).toEqual([]);

      expect(await search(id, { due: 'upcoming' }, upcomingZone)).toEqual([
        'straddles midnight',
      ]);
      expect(await search(id, { due: 'today' }, upcomingZone)).toEqual([]);
    });

    it('AC-4: due=none returns exactly the tasks with no due date', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'no due date');
      await seed(id, inbox, 'has a due date', {
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      });

      await expect(search(id, { due: 'none' })).resolves.toEqual([
        'no due date',
      ]);
    });

    it('AC-4/AC-12: due=overdue takes NO zone — the answer is the same in both', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'past due', {
        dueAt: new Date(Date.now() - 3_600_000).toISOString(),
      });

      // An instant either has passed or has not, everywhere at once (D5).
      expect(await search(id, { due: 'overdue' }, NEW_YORK)).toEqual([
        'past due',
      ]);
      expect(await search(id, { due: 'overdue' }, CALCUTTA)).toEqual([
        'past due',
      ]);
    });
  });

  describe('combination and consistency', () => {
    it('AC-5: criteria are conjunctive, and dropping one widens the result', async () => {
      const { id, inbox } = await freshUser();
      const past = new Date(Date.now() - 3_600_000).toISOString();
      await seed(id, inbox, 'report overdue', { dueAt: past });
      await seed(id, inbox, 'report done', { completed: true });
      await seed(id, inbox, 'unrelated overdue', { dueAt: past });

      expect(await search(id, { q: 'report', status: 'overdue' })).toEqual([
        'report overdue',
      ]);
      expect((await search(id, { q: 'report' })).sort()).toEqual([
        'report done',
        'report overdue',
      ]);
      expect((await search(id, { status: 'overdue' })).sort()).toEqual([
        'report overdue',
        'unrelated overdue',
      ]);
    });

    it('AC-5: a contradictory pair returns empty rather than erroring', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'completed past due', {
        completed: true,
        dueAt: new Date(Date.now() - 3_600_000).toISOString(),
      });

      // completed AND overdue cannot both hold — overdue requires active.
      await expect(
        search(id, { status: 'completed', due: 'overdue' }),
      ).resolves.toEqual([]);
    });

    it('AC-12: status=overdue and due=overdue return identical sets', async () => {
      const { id, inbox } = await freshUser();
      const past = new Date(Date.now() - 3_600_000).toISOString();
      await seed(id, inbox, 'overdue one', { dueAt: past });
      await seed(id, inbox, 'overdue two', { dueAt: past });
      await seed(id, inbox, 'not overdue', {
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      await seed(id, inbox, 'completed past due', {
        completed: true,
        dueAt: past,
      });

      const byStatus = (await search(id, { status: 'overdue' })).sort();
      const byDue = (await search(id, { due: 'overdue' })).sort();

      expect(byStatus).toEqual(['overdue one', 'overdue two']);
      expect(byDue).toEqual(byStatus); // one definition, two doors (D5)
    });
  });

  describe('ordering and paging (FR-SRCH-009, D4)', () => {
    it('orders newest first, breaking ties by id', async () => {
      const { id, inbox } = await freshUser();
      await seed(id, inbox, 'oldest', { createdAt: '2026-01-01T00:00:00Z' });
      await seed(id, inbox, 'newest', { createdAt: '2026-03-01T00:00:00Z' });
      await seed(id, inbox, 'middle', { createdAt: '2026-02-01T00:00:00Z' });

      await expect(search(id, { status: 'active' })).resolves.toEqual([
        'newest',
        'middle',
        'oldest',
      ]);
    });

    it('reports hasMore only when another page exists', async () => {
      const { id, inbox } = await freshUser();
      for (let i = 0; i < 3; i++) await seed(id, inbox, `task ${i}`);

      const page = await repo.search(
        id,
        parseCriteria({ status: 'active', limit: 2 }),
        'UTC',
      );
      expect(page.rows).toHaveLength(2); // the probe row is dropped
      expect(page.hasMore).toBe(true);

      const exact = await repo.search(
        id,
        parseCriteria({ status: 'active', limit: 3 }),
        'UTC',
      );
      expect(exact.rows).toHaveLength(3);
      expect(exact.hasMore).toBe(false); // exactly a full page is not "more"
    });
  });
});
