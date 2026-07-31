import { SEARCH_PAGE_SIZE, SEARCH_QUERY_MAX_LENGTH } from '@todo/shared';
import {
  decodeCursor,
  encodeCursor,
  escapeLike,
  parseCriteria,
} from './search.criteria';
import {
  NoSearchCriteriaError,
  SearchCriteriaInvalidError,
} from './search.errors';

// FEAT-015 T3 — the rules that decide what a search *is* before any SQL runs:
// AC-9 (every invalid parameter names its own field), AC-14 (LIKE
// metacharacters are literal), and the cursor codec's round trip and rejections
// (technical-design D4, D6, D8).

const fieldOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    if (err instanceof SearchCriteriaInvalidError) return err.field;
    return `unexpected: ${String(err)}`;
  }
  return 'did not throw';
};

describe('parseCriteria', () => {
  it('trims the term and keeps the other criteria null', () => {
    expect(parseCriteria({ q: '  report  ' })).toEqual({
      term: 'report',
      status: null,
      due: null,
      limit: SEARCH_PAGE_SIZE,
      cursor: null,
      // Search has exactly one order and the parser is the only thing that
      // produces it; the smart views' `due` sort is built directly, never
      // parsed from a request (FEAT-016 D2).
      sort: 'newest',
    });
  });

  it('accepts a filter with no keyword — a filter IS a criterion', () => {
    expect(parseCriteria({ status: 'active' }).status).toBe('active');
    expect(parseCriteria({ due: 'today' }).due).toBe('today');
  });

  it('AC-9: a request with no criteria at all is rejected (D6)', () => {
    expect(() => parseCriteria({})).toThrow(NoSearchCriteriaError);
    // ...and a limit alone is still no criteria: page size is not a question.
    expect(() => parseCriteria({ limit: 10 })).toThrow(NoSearchCriteriaError);
  });

  it.each([
    ['an empty q', { q: '' }, 'q'],
    ['a whitespace-only q', { q: '   ' }, 'q'],
    ['an over-long q', { q: 'a'.repeat(SEARCH_QUERY_MAX_LENGTH + 1) }, 'q'],
    ['an unknown status', { status: 'archived' }, 'status'],
    ['an unknown due bucket', { due: 'yesterday' }, 'due'],
    ['a zero limit', { q: 'x', limit: 0 }, 'limit'],
    ['a negative limit', { q: 'x', limit: -5 }, 'limit'],
    ['an over-max limit', { q: 'x', limit: 51 }, 'limit'],
    ['a fractional limit', { q: 'x', limit: 2.5 }, 'limit'],
  ])('AC-9: %s is rejected on its own field', (_label, raw, field) => {
    expect(fieldOf(() => parseCriteria(raw))).toBe(field);
  });

  it('AC-9: a term of exactly the maximum length is accepted', () => {
    const term = 'a'.repeat(SEARCH_QUERY_MAX_LENGTH);
    expect(parseCriteria({ q: term }).term).toBe(term);
  });

  it('defaults the page size when limit is absent', () => {
    expect(parseCriteria({ q: 'x' }).limit).toBe(SEARCH_PAGE_SIZE);
  });
});

describe('escapeLike (AC-14, D8)', () => {
  it.each([
    ['a bare percent', '%', '\\%'],
    ['a bare underscore', '_', '\\_'],
    ['a backslash', '\\', '\\\\'],
    ['a wildcard inside a word', 'report_v2', 'report\\_v2'],
    ['both metacharacters', '50%_off', '50\\%\\_off'],
    ['nothing to escape', 'quarterly report', 'quarterly report'],
  ])('escapes %s', (_label, input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });

  it('escapes the backslash BEFORE the wildcards, not after', () => {
    // Getting this order wrong double-escapes: '\%' would become '\\\\%'
    // (a literal backslash followed by a wildcard) instead of '\\\\\\%'.
    expect(escapeLike('\\%')).toBe('\\\\\\%');
  });

  it('is applied by parseCriteria, not left to the caller', () => {
    // The rule lives in one place. A term reaching the repository unescaped is
    // the bug AC-14 exists to catch — searching '%' would match every task.
    expect(parseCriteria({ q: '%' }).term).toBe('\\%');
  });
});

describe('the cursor codec (D4)', () => {
  // Full database precision — microseconds, which is why the cursor carries
  // TEXT rather than a JS Date (a Date truncates to milliseconds, and a
  // truncated cursor returns an empty second page).
  const cursor = {
    sortKey: '2026-07-31T09:15:00.123456Z',
    id: '11111111-1111-4111-8111-111111111111',
  };

  it('round-trips a cursor through encode → decode', () => {
    const decoded = decodeCursor(encodeCursor(cursor));
    expect(decoded?.id).toBe(cursor.id);
    // Byte-identical, microseconds included — the assertion a Date-based
    // cursor cannot pass.
    expect(decoded?.sortKey).toBe(cursor.sortKey);
  });

  it('re-encodes to the same string — the codec is stable', () => {
    const once = encodeCursor(cursor);
    expect(encodeCursor(decodeCursor(once)!)).toBe(once);
  });

  it('is opaque: the tuple is not readable from the cursor as-is', () => {
    // Not a security property — an encoding one. Clients must not parse it, so
    // it must not look parseable.
    const encoded = encodeCursor(cursor);
    expect(encoded).not.toContain(cursor.id);
    expect(encoded).not.toContain('2026-07-31');
  });

  it('returns null when absent — the first page needs no cursor', () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it.each([
    ['not base64 at all', '!!!not-a-cursor!!!'],
    ['base64 of nonsense', Buffer.from('nonsense').toString('base64url')],
    [
      'a valid date but no id',
      Buffer.from('2026-07-31T09:15:00.123456Z|').toString('base64url'),
    ],
    [
      'a valid id but no date',
      Buffer.from('|11111111-1111-4111-8111-111111111111').toString(
        'base64url',
      ),
    ],
    [
      'an id that is not a uuid',
      Buffer.from('2026-07-31T09:15:00.123456Z|not-a-uuid').toString(
        'base64url',
      ),
    ],
    [
      'a date that is not a date',
      Buffer.from('never|11111111-1111-4111-8111-111111111111').toString(
        'base64url',
      ),
    ],
  ])('AC-9: rejects %s on field `cursor`', (_label, raw) => {
    // Rejected, never silently treated as page one — which would loop a client
    // on the first page forever while looking like it was paging.
    expect(fieldOf(() => decodeCursor(raw))).toBe('cursor');
  });
});
