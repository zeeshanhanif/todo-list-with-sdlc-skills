import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { UserTimeZoneService } from '../../common/preferences/user-timezone.service';
import { SearchRepository } from './search.repository';
import { SearchService } from './search.service';
import { ViewsService } from './views.service';
import { SmartViewNotFoundError } from './views.errors';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-016 T4 — ViewsService: AC-2 (Today in the caller's zone), AC-3
// (Upcoming), AC-4 (Overdue is the SAME set search returns, one definition),
// AC-5 (All), AC-6 (completed and soft-deleted excluded from every view),
// AC-7 (Today and Overdue overlap by definition — FR-SRCH-008's own semantics).
const providers = [
  ViewsService,
  SearchService,
  SearchRepository,
  UserTimeZoneService,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

/**
 * A fixed-offset zone pair, chosen from the CURRENT instant so the day-boundary
 * property under test holds at every hour (DEF-010).
 *
 * The bug this replaces: the pair was hard-coded (New York / Calcutta) and the
 * assertion "Today here, Upcoming there" is only true while those two zones
 * share a calendar date — false after about 14:30 New York time, so the suite
 * failed for a stretch of every day and passed for the rest.
 *
 * The fix is not to weaken the assertion but to stop leaving the *premise* to
 * chance. `near` is a zone where it is currently ~02:00, so "later today" always
 * has room; `ahead` is three hours further east, so its local clock reads ~05:00
 * on the SAME date. A task at 23:00 on `near`'s today is therefore today in
 * `near` and 02:00 tomorrow in `ahead` — at every hour of the year.
 *
 * `Etc/GMT±N` is used deliberately: fixed offsets, no DST, so nothing here
 * shifts under a transition either. (Their sign is inverted by POSIX
 * convention — `Etc/GMT-5` is UTC+5.)
 */
function zonePair(now: Date = new Date()): { near: string; ahead: string } {
  const utcHour = now.getUTCHours();
  // The offset that puts local time at ~02:00, normalised into [-12, +11] so
  // that `+3` below still lands inside the Etc range's +14 ceiling.
  const raw = (2 - utcHour + 24) % 24;
  const offset = raw > 11 ? raw - 24 : raw;
  const etc = (hours: number): string =>
    `Etc/GMT${hours >= 0 ? '-' : '+'}${Math.abs(hours)}`;
  return { near: etc(offset), ahead: etc(offset + 3) };
}

describe('ViewsService (integration)', () => {
  let db: DbService;
  let views: ViewsService;
  let search: SearchService;
  const userIds: string[] = [];

  const freshUser = async (
    timezone: string | null = null,
  ): Promise<{ id: string; inbox: string }> => {
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, timezone) VALUES ($1, 'x', $2)
       RETURNING id`,
      [`views-${randomUUID()}@example.com`, timezone],
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

  const seed = async (
    ownerId: string,
    listId: string,
    title: string,
    opts: {
      dueAt?: string | null;
      completed?: boolean;
      deleted?: boolean;
    } = {},
  ): Promise<string> => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO tasks (owner_id, list_id, title, due_at, completed_at, deleted_at)
       VALUES ($1, $2, $3, $4::timestamptz,
               ${opts.completed ? 'now()' : 'NULL'},
               ${opts.deleted ? 'now()' : 'NULL'})
       RETURNING id`,
      [ownerId, listId, title, opts.dueAt ?? null],
    );
    return r.rows[0].id;
  };

  /** Titles a view returns, order preserved. */
  const titles = async (userId: string, view: string): Promise<string[]> =>
    (await views.view(userId, view, {})).results.map((r) => r.title);

  const setTimezone = async (userId: string, tz: string): Promise<void> => {
    await db.query('UPDATE users SET timezone = $2 WHERE id = $1', [
      userId,
      tz,
    ]);
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    views = mod.get(ViewsService);
    search = mod.get(SearchService);
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

  const hours = (n: number) =>
    new Date(Date.now() + n * 3_600_000).toISOString();
  const days = (n: number) =>
    new Date(Date.now() + n * 86_400_000).toISOString();

  describe('Today (FR-SRCH-008)', () => {
    it('AC-2: the same task is Today in one zone and Upcoming in another', async () => {
      // The property FEAT-015 AC-4 pinned with a fixed instant, expressed so it
      // holds whenever the suite runs — including the hours the original
      // New York / Calcutta pairing could not survive (DEF-010).
      const { near, ahead } = zonePair();
      const { id, inbox } = await freshUser(near);
      // 23:00 on the stored zone's today: late enough that a zone three hours
      // east has already rolled over, and `now()` is the DATABASE's clock, so
      // the boundary is computed where the service computes it.
      const lateToday = await db.query<{ due: string }>(
        `SELECT ((now() AT TIME ZONE $1)::date + interval '23 hour')
                 AT TIME ZONE $1 AS due`,
        [near],
      );
      await seed(id, inbox, 'the boundary task', {
        dueAt: lateToday.rows[0].due,
      });

      await expect(titles(id, 'today')).resolves.toEqual(['the boundary task']);
      await expect(titles(id, 'upcoming')).resolves.toEqual([]);

      // The stored zone is the ONLY thing that changes.
      await setTimezone(id, ahead);
      await expect(titles(id, 'today')).resolves.toEqual([]);
      await expect(titles(id, 'upcoming')).resolves.toEqual([
        'the boundary task',
      ]);
    });

    it('AC-2: Today holds tasks due within the current day and nothing else', async () => {
      const { id, inbox } = await freshUser('UTC');
      // Built as a timestamptz in SQL — `now()::date` alone is a timestamp
      // WITHOUT time zone, which the driver re-interprets in the Node process's
      // own zone on the way back in, silently moving the instant off the day
      // the test means.
      const startOfDay = await db.query<{ due: string }>(
        `SELECT ((now() AT TIME ZONE 'UTC')::date + interval '30 minute')
                 AT TIME ZONE 'UTC' AS due`,
      );
      await seed(id, inbox, 'due later today', { dueAt: hours(1) });
      await seed(id, inbox, 'due early today', {
        dueAt: startOfDay.rows[0].due,
      });
      await seed(id, inbox, 'due tomorrow', { dueAt: days(1) });
      await seed(id, inbox, 'no due date');

      const today = await titles(id, 'today');
      expect(today.sort()).toEqual(['due early today', 'due later today']);
    });
  });

  describe('Upcoming (FR-SRCH-008)', () => {
    it('AC-3: holds tasks due after the current day, not today and not undated', async () => {
      const { id, inbox } = await freshUser('UTC');
      await seed(id, inbox, 'due tomorrow', { dueAt: days(1) });
      await seed(id, inbox, 'due next week', { dueAt: days(7) });
      await seed(id, inbox, 'due later today', { dueAt: hours(1) });
      await seed(id, inbox, 'overdue', { dueAt: hours(-2) });
      await seed(id, inbox, 'no due date');

      await expect(titles(id, 'upcoming')).resolves.toEqual([
        'due tomorrow',
        'due next week', // due-ascending (AC-10)
      ]);
    });
  });

  describe('Overdue (FR-SRCH-008, FEAT-011 D3)', () => {
    it('AC-4: returns exactly the same set as search, and every member is isOverdue', async () => {
      const { id, inbox } = await freshUser('UTC');
      await seed(id, inbox, 'overdue one', { dueAt: hours(-3) });
      await seed(id, inbox, 'overdue two', { dueAt: hours(-1) });
      await seed(id, inbox, 'not yet due', { dueAt: hours(3) });
      await seed(id, inbox, 'completed but past due', {
        dueAt: hours(-4),
        completed: true,
      });
      await seed(id, inbox, 'no due date');

      const view = await views.view(id, 'overdue', {});
      const byStatus = await search.search(id, { status: 'overdue' });
      const byBucket = await search.search(id, { due: 'overdue' });

      const ids = (rs: { results: { id: string }[] }) =>
        rs.results.map((r) => r.id).sort();

      expect(ids(view)).toEqual(ids(byStatus));
      expect(ids(view)).toEqual(ids(byBucket));
      expect(view.results.map((r) => r.title).sort()).toEqual([
        'overdue one',
        'overdue two',
      ]);
      // The payload agrees with the filter that selected it — one definition
      // of overdue across all the surfaces that express it.
      expect(view.results.every((r) => r.isOverdue)).toBe(true);
    });
  });

  describe('All (FR-SRCH-008)', () => {
    it('AC-5: holds every active task including undated ones, and is a superset of the three', async () => {
      const { id, inbox } = await freshUser('UTC');
      await seed(id, inbox, 'undated');
      await seed(id, inbox, 'due today', { dueAt: hours(1) });
      await seed(id, inbox, 'due tomorrow', { dueAt: days(1) });
      await seed(id, inbox, 'overdue', { dueAt: hours(-1) });

      const all = new Set(await titles(id, 'all'));
      expect(all.size).toBe(4);
      expect(all.has('undated')).toBe(true);

      for (const view of ['today', 'upcoming', 'overdue']) {
        for (const title of await titles(id, view)) {
          expect(all.has(title)).toBe(true);
        }
      }
    });

    it('AC-10: All is ordered newest-created first, not by due date', async () => {
      const { id, inbox } = await freshUser('UTC');
      // Due dates run in the SAME direction as creation, which is what makes
      // this falsifiable: newest-first yields third/second/first while
      // due-ascending yields the exact reverse, so an implementation that gave
      // `all` the due views' sort key cannot pass. (Inverse due dates — the
      // obvious fixture — make the two orders identical and prove nothing;
      // caught by mutating the sort during acceptance.)
      await db.query(
        `INSERT INTO tasks (owner_id, list_id, title, due_at, created_at) VALUES
           ($1, $2, 'created first',  now() + interval '1 day', now() - interval '3 hour'),
           ($1, $2, 'created second', now() + interval '5 day', now() - interval '2 hour'),
           ($1, $2, 'created third',  now() + interval '9 day', now() - interval '1 hour')`,
        [id, inbox],
      );

      await expect(titles(id, 'all')).resolves.toEqual([
        'created third',
        'created second',
        'created first',
      ]);
    });
  });

  describe('exclusions and overlap (FR-SRCH-008)', () => {
    it('AC-6: a completed and a soft-deleted task appear in NO view', async () => {
      const { id, inbox } = await freshUser('UTC');
      // Both are due in a window that would otherwise place them in today AND
      // overdue — so their absence cannot be an accident of the fixture.
      await seed(id, inbox, 'completed', { dueAt: hours(-1), completed: true });
      await seed(id, inbox, 'deleted', { dueAt: hours(-1), deleted: true });
      await seed(id, inbox, 'the only member', { dueAt: hours(-1) });

      for (const view of ['today', 'upcoming', 'overdue', 'all']) {
        const found = await titles(id, view);
        expect(found).not.toContain('completed');
        expect(found).not.toContain('deleted');
      }
      await expect(titles(id, 'overdue')).resolves.toEqual(['the only member']);
    });

    it('AC-7: a task due earlier today is in BOTH Today and Overdue', async () => {
      const { id, inbox } = await freshUser('UTC');
      // The FIRST instant of the current UTC day: on the current calendar day
      // by construction, and in the past for every `now()` after it — so this
      // task is a member of Today and of Overdue at any hour the suite runs,
      // with no clock-dependent skip.
      // `::timestamp` before `AT TIME ZONE` is load-bearing: a bare `date` is
      // cast to timestamptz first, which turns the expression into the OTHER
      // direction of AT TIME ZONE and hands back a timestamp without a zone —
      // which the driver then re-reads in the Node process's zone, moving the
      // instant off the day the test means.
      const startOfDay = await db.query<{ due: string }>(
        `SELECT (now() AT TIME ZONE 'UTC')::date::timestamp
                 AT TIME ZONE 'UTC' AS due`,
      );

      await seed(id, inbox, 'missed this morning', {
        dueAt: startOfDay.rows[0].due,
      });

      await expect(titles(id, 'today')).resolves.toEqual([
        'missed this morning',
      ]);
      await expect(titles(id, 'overdue')).resolves.toEqual([
        'missed this morning',
      ]);
    });
  });

  describe('cross-list aggregation and unknown views', () => {
    it('AC-1: a view aggregates across every list the caller owns, with list names', async () => {
      const { id, inbox } = await freshUser('UTC');
      const work = await addList(id, 'Work');
      await seed(id, inbox, 'inbox task', { dueAt: days(1) });
      await seed(id, work, 'work task', { dueAt: days(2) });

      const res = await views.view(id, 'upcoming', {});
      expect(res.view).toBe('upcoming');
      expect(res.results.map((r) => [r.title, r.listName])).toEqual([
        ['inbox task', 'Inbox'],
        ['work task', 'Work'],
      ]);
    });

    it("AC-12: another user's qualifying task never appears", async () => {
      const mine = await freshUser('UTC');
      const theirs = await freshUser('UTC');
      await seed(theirs.id, theirs.inbox, 'their task', { dueAt: days(1) });
      await seed(mine.id, mine.inbox, 'my task', { dueAt: days(1) });

      await expect(titles(mine.id, 'upcoming')).resolves.toEqual(['my task']);
      await expect(titles(mine.id, 'all')).resolves.toEqual(['my task']);
    });

    it('AC-12: an unknown view name is rejected as not-found, not as a filter', async () => {
      const { id } = await freshUser('UTC');
      await expect(views.view(id, 'yesterday', {})).rejects.toBeInstanceOf(
        SmartViewNotFoundError,
      );
    });
  });
});
