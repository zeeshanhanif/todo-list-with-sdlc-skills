import { DbService } from './db.service';

// Integration test (needs the local Postgres; schema ensured by jest globalSetup).
// Demonstrates DbService.transaction: commit persists, a thrown error rolls back.
// Uses a dedicated scratch table so it is independent of the domain schema.
describe('DbService.transaction (integration)', () => {
  let db: DbService;

  beforeAll(async () => {
    db = new DbService();
    await db.query('CREATE TABLE IF NOT EXISTS _tx_test (id text primary key)');
    await db.query('TRUNCATE _tx_test');
  });

  afterAll(async () => {
    await db.query('DROP TABLE IF EXISTS _tx_test');
    await db.onModuleDestroy();
  });

  it('commits when the callback resolves — the row persists', async () => {
    await db.transaction(async (tx) => {
      await tx.query('INSERT INTO _tx_test (id) VALUES ($1)', ['commit-row']);
    });
    const res = await db.query<{ count: string }>(
      "SELECT COUNT(*)::int AS count FROM _tx_test WHERE id = 'commit-row'",
    );
    expect(Number(res.rows[0].count)).toBe(1);
  });

  it('rolls back when the callback throws — the row does not persist', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('INSERT INTO _tx_test (id) VALUES ($1)', [
          'rollback-row',
        ]);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const res = await db.query<{ count: string }>(
      "SELECT COUNT(*)::int AS count FROM _tx_test WHERE id = 'rollback-row'",
    );
    expect(Number(res.rows[0].count)).toBe(0);
  });
});
