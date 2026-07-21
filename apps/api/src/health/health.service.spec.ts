import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { DbService } from '../infra/db.service';

// Example unit test for the API unit (Jest — Nest default; see scaffold-notes:
// architecture named no test framework, ecosystem-standard used as fallback).
// The DbService is faked so the test needs no live Postgres.
describe('HealthService', () => {
  it('reports ok/up and the ping count when the DB round-trips', async () => {
    const fakeDb: Pick<DbService, 'query'> = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 42 }] }) // INSERT ... RETURNING id
        .mockResolvedValueOnce({ rows: [{ count: 7 }] }), // SELECT COUNT(*)
    };

    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: DbService, useValue: fakeDb }],
    }).compile();

    const result = await moduleRef.get(HealthService).check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
    expect(result.pingId).toBe(42);
    expect(result.pingCount).toBe(7);
    expect(result.service).toBe('api');
  });

  it('reports degraded/down when the DB query throws', async () => {
    const fakeDb: Pick<DbService, 'query'> = {
      query: jest.fn().mockRejectedValue(new Error('no db')),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: DbService, useValue: fakeDb }],
    }).compile();

    const result = await moduleRef.get(HealthService).check();

    expect(result.status).toBe('degraded');
    expect(result.db).toBe('down');
    expect(result.pingId).toBeNull();
  });
});
