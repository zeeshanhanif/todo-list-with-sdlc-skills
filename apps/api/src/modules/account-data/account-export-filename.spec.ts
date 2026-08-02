import { accountExportFilename } from '@todo/shared';

/**
 * FEAT-017 T1 — `accountExportFilename` (technical-design D5).
 *
 * The helper lives in `@todo/shared` because both tiers must produce the same
 * string (the API's `Content-Disposition`, the browser's `download` attribute).
 * Its spec lives here because `@todo/shared` has no test runner of its own and
 * the API is where the *authoritative* filename is minted — the same reason the
 * package's other helpers are exercised from their consumers.
 *
 * What is actually under test is the timezone rule, not the formatting: the date
 * is the user's local date, which is why the same instant produces two different
 * filenames in two zones.
 */
describe('accountExportFilename (FEAT-017 T1, D5)', () => {
  // 2026-08-01T20:30:00Z is 2026-08-02 02:00 in Calcutta (+05:30) and
  // 2026-08-01 16:30 in New York (EDT, -04:00) — one instant, two dates.
  const lateEvening = '2026-08-01T20:30:00.000Z';

  it('resolves the date in the passed zone, not UTC (FR-PROF-003, NFR-LOC-001)', () => {
    expect(accountExportFilename(lateEvening, 'Asia/Calcutta')).toBe(
      'todo-export-2026-08-02.json',
    );
    expect(accountExportFilename(lateEvening, 'America/New_York')).toBe(
      'todo-export-2026-08-01.json',
    );
  });

  it('the two zones disagree for the same instant — the point of the rule', () => {
    expect(accountExportFilename(lateEvening, 'Asia/Calcutta')).not.toBe(
      accountExportFilename(lateEvening, 'America/New_York'),
    );
  });

  it('renders the UTC date under "UTC" — the null-timezone fallback', () => {
    expect(accountExportFilename(lateEvening, 'UTC')).toBe(
      'todo-export-2026-08-01.json',
    );
  });

  it('crosses the year boundary in the user’s zone, not the server’s', () => {
    // 00:30 UTC on New Year's Day is still 19:30 on New Year's Eve in New York.
    const newYear = '2026-01-01T00:30:00.000Z';
    expect(accountExportFilename(newYear, 'UTC')).toBe(
      'todo-export-2026-01-01.json',
    );
    expect(accountExportFilename(newYear, 'America/New_York')).toBe(
      'todo-export-2025-12-31.json',
    );
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(accountExportFilename(new Date(lateEvening), 'UTC')).toBe(
      accountExportFilename(lateEvening, 'UTC'),
    );
  });

  it('always matches the declared filename shape', () => {
    const shape = /^todo-export-\d{4}-\d{2}-\d{2}\.json$/;
    for (const zone of [
      'UTC',
      'Asia/Calcutta',
      'Asia/Kolkata',
      'America/New_York',
      'Australia/Eucla', // +08:45, a quarter-hour offset
      'Pacific/Kiritimati', // +14:00, the furthest-ahead zone
      'Etc/GMT+12',
    ]) {
      expect(accountExportFilename(lateEvening, zone)).toMatch(shape);
    }
  });

  it('is unaffected by the machine’s own TZ', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Auckland';
      expect(accountExportFilename(lateEvening, 'UTC')).toBe(
        'todo-export-2026-08-01.json',
      );
    } finally {
      process.env.TZ = original;
    }
  });
});
