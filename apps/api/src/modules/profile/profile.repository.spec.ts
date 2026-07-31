import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { ProfileRepository } from './profile.repository';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-008 T3 — ProfileRepository: AC-1 (the row round-trips all four fields),
// AC-13 (a one-key patch leaves the other columns — including `users` columns
// this feature never addresses — untouched), and the unknown-user path.
// Validation lives in ProfileService and is asserted in T4, per that task's own
// done-when; this file asserts persistence only.
const providers = [
  ProfileRepository,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

describe('ProfileRepository (integration)', () => {
  let db: DbService;
  let profiles: ProfileRepository;
  const userIds: string[] = [];

  const freshUser = async (): Promise<{ id: string; email: string }> => {
    const email = `profilerepo-${randomUUID()}@example.com`;
    const u = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'hash-do-not-touch')
       RETURNING id`,
      [email],
    );
    userIds.push(u.rows[0].id);
    return { id: u.rows[0].id, email };
  };

  /** The raw row, including the columns this feature must never disturb. */
  const rawRow = async (id: string) =>
    (
      await db.query<{
        email: string;
        password_hash: string;
        display_name: string | null;
        timezone: string | null;
        theme: string;
        updated_at: Date;
      }>(
        `SELECT email, password_hash, display_name, timezone, theme, updated_at
           FROM users WHERE id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    profiles = mod.get(ProfileRepository);
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

  it('AC-1: a new account reads back as email + the two nulls + theme "system"', async () => {
    const { id, email } = await freshUser();

    await expect(profiles.findByUserId(id)).resolves.toEqual({
      email,
      displayName: null, // never set — the default is derived, not stored (D1)
      timezone: null, // not yet established (D2)
      theme: 'system', // the column default, backfilled by migration 010
    });
  });

  it('AC-1: all four fields round-trip through a full patch', async () => {
    const { id, email } = await freshUser();

    const updated = await profiles.update(id, {
      displayName: 'Ada Lovelace',
      timezone: 'Asia/Kolkata',
      theme: 'dark',
    });

    expect(updated).toEqual({
      email,
      displayName: 'Ada Lovelace',
      timezone: 'Asia/Kolkata',
      theme: 'dark',
    });
    // ...and the read agrees with the write's own return value.
    await expect(profiles.findByUserId(id)).resolves.toEqual(updated);
  });

  it('AC-6/D2: the timezone is stored byte-identical, never re-canonicalized', async () => {
    const { id } = await freshUser();

    // `Asia/Calcutta` is the alias this runtime's ICU canonicalizes TO, and
    // `Asia/Kolkata` the one browsers canonicalize to. The column must hold
    // whichever the caller sent, or the settings picker cannot match it (D2).
    for (const zone of [
      'Asia/Kolkata',
      'Asia/Calcutta',
      'UTC',
      'America/New_York',
    ]) {
      await profiles.update(id, { timezone: zone });
      expect((await rawRow(id)).timezone).toBe(zone);
    }
  });

  it('AC-13: a one-key patch leaves every other column exactly as it was', async () => {
    const { id } = await freshUser();
    await profiles.update(id, {
      displayName: 'Ada',
      timezone: 'Europe/Paris',
      theme: 'dark',
    });
    const before = await rawRow(id);

    const after = await profiles.update(id, { theme: 'light' });

    expect(after).toMatchObject({
      displayName: 'Ada', // untouched
      timezone: 'Europe/Paris', // untouched
      theme: 'light', // the one field addressed
    });
    const row = await rawRow(id);
    expect(row.display_name).toBe(before.display_name);
    expect(row.timezone).toBe(before.timezone);
    // Columns this feature has no business writing.
    expect(row.email).toBe(before.email);
    expect(row.password_hash).toBe('hash-do-not-touch');
    // ...and the write did happen: updated_at moved.
    expect(row.updated_at.getTime()).toBeGreaterThanOrEqual(
      before.updated_at.getTime(),
    );
  });

  it('AC-5/D1: displayName: null unsets the column (a value, not an omission)', async () => {
    const { id } = await freshUser();
    await profiles.update(id, { displayName: 'Ada' });

    const after = await profiles.update(id, { displayName: null });

    expect(after?.displayName).toBeNull();
    expect((await rawRow(id)).display_name).toBeNull();
  });

  it('an unknown user id returns null from both methods and writes nothing', async () => {
    const ghost = randomUUID();

    await expect(profiles.findByUserId(ghost)).resolves.toBeNull();
    await expect(profiles.update(ghost, { theme: 'dark' })).resolves.toBeNull();

    const count = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM users WHERE id = $1',
      [ghost],
    );
    expect(count.rows[0].n).toBe('0');
  });

  it('refuses an empty patch rather than issuing a write that says nothing', async () => {
    const { id } = await freshUser();

    await expect(profiles.update(id, {})).rejects.toThrow(/empty patch/i);
  });
});
