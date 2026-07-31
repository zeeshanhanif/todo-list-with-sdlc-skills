import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { APP_CONFIG, readConfig } from '../../infra/config';
import { DbService } from '../../infra/db.service';
import { UserTimeZoneService } from './user-timezone.service';

// Integration tests (need local Postgres; schema ensured by jest globalSetup).
// FEAT-015 T2 — the effective-timezone rule in one place (technical-design D1):
// a stored zone comes back VERBATIM (FEAT-008 D2 stores it unnormalized), and
// every "no zone" case resolves to UTC rather than throwing.
const providers = [
  UserTimeZoneService,
  DbService,
  { provide: APP_CONFIG, useFactory: readConfig },
];

describe('UserTimeZoneService (integration)', () => {
  let db: DbService;
  let zones: UserTimeZoneService;
  const userIds: string[] = [];

  const userWith = async (timezone: string | null): Promise<string> => {
    const res = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, timezone) VALUES ($1, 'x', $2)
       RETURNING id`,
      [`tz-${randomUUID()}@example.com`, timezone],
    );
    userIds.push(res.rows[0].id);
    return res.rows[0].id;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ providers }).compile();
    db = mod.get(DbService);
    zones = mod.get(UserTimeZoneService);
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

  it.each(['Asia/Calcutta', 'Asia/Kolkata', 'America/New_York', 'UTC'])(
    'returns a stored zone verbatim: %s',
    async (zone) => {
      const id = await userWith(zone);

      // Verbatim, not re-canonicalized — the same guarantee FEAT-008 D2 makes at
      // the column, now guaranteed through this read as well. A service that
      // "helpfully" normalized here would hand the settings picker a zone id its
      // own option list may not contain.
      await expect(zones.effectiveFor(id)).resolves.toBe(zone);
    },
  );

  it('falls back to UTC when the account has never established a zone', async () => {
    const id = await userWith(null);

    await expect(zones.effectiveFor(id)).resolves.toBe('UTC');
  });

  it('falls back to UTC for an unknown id rather than throwing', async () => {
    // A search must not 500 because a preference could not be found.
    await expect(zones.effectiveFor(randomUUID())).resolves.toBe('UTC');
  });

  it('reads one user without seeing another', async () => {
    const paris = await userWith('Europe/Paris');
    const tokyo = await userWith('Asia/Tokyo');

    await expect(zones.effectiveFor(paris)).resolves.toBe('Europe/Paris');
    await expect(zones.effectiveFor(tokyo)).resolves.toBe('Asia/Tokyo');
  });
});
