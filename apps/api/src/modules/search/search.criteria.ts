import {
  SEARCH_DUE_BUCKETS,
  SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_STATUSES,
  type SearchDueBucket,
  type SearchStatus,
} from '@todo/shared';
import {
  NoSearchCriteriaError,
  SearchCriteriaInvalidError,
} from './search.errors';

/** A decoded keyset cursor — the exact `ORDER BY` tuple (technical-design D4). */
export interface SearchCursor {
  createdAt: Date;
  id: string;
}

/** Validated, normalized search criteria: what the repository actually runs. */
export interface SearchCriteria {
  /** Already trimmed **and LIKE-escaped** — bind it directly (D8). */
  term: string | null;
  status: SearchStatus | null;
  due: SearchDueBucket | null;
  limit: number;
  cursor: SearchCursor | null;
}

/** The raw shape the controller hands over (query strings, so mostly text). */
export interface RawSearchQuery {
  q?: string;
  status?: string;
  due?: string;
  limit?: number;
  cursor?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate and normalize a request's criteria (technical-design §3.1, D6, D8).
 *
 * Every rejection names its own field, so the client can render the message
 * under the control the user actually touched.
 */
export function parseCriteria(raw: RawSearchQuery): SearchCriteria {
  const term = parseTerm(raw.q);
  const status = parseMember(
    raw.status,
    SEARCH_STATUSES,
    'status',
    'Choose a status filter from the list.',
  );
  const due = parseMember(
    raw.due,
    SEARCH_DUE_BUCKETS,
    'due',
    'Choose a due-date filter from the list.',
  );

  // D6: the empty question is not answered with everything.
  if (term === null && status === null && due === null) {
    throw new NoSearchCriteriaError();
  }

  return {
    term,
    status,
    due,
    limit: parseLimit(raw.limit),
    cursor: decodeCursor(raw.cursor),
  };
}

/** FR-SRCH-001: trimmed, non-empty, bounded — then escaped for `LIKE` (D8). */
function parseTerm(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SearchCriteriaInvalidError('q', 'Enter something to search for.');
  }
  if (trimmed.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new SearchCriteriaInvalidError(
      'q',
      `Keep your search to ${SEARCH_QUERY_MAX_LENGTH} characters or fewer.`,
    );
  }
  return escapeLike(trimmed);
}

/**
 * Escape the `LIKE` metacharacters so the match is **literal** (D8).
 *
 * Without this, searching `%` matches every task and `report_v2` matches
 * `report-v2` — because `%` and `_` are wildcards to `ILIKE`. A person typing
 * into a search box means the characters they typed. The backslash goes first,
 * or it would double-escape the escapes added after it.
 *
 * This is a *matching* concern, not an injection one: the term is always bound
 * as a parameter, never concatenated into the statement.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function parseMember<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  field: 'status' | 'due',
  requirement: string,
): T | null {
  if (raw === undefined) return null;
  if (!allowed.includes(raw as T)) {
    throw new SearchCriteriaInvalidError(field, requirement);
  }
  return raw as T;
}

/** FR-SRCH-009. Out of range is a `400`, never a silent clamp — a client that
 * asked for 500 and got 50 without being told would conclude there were 50. */
function parseLimit(raw: number | undefined): number {
  if (raw === undefined) return SEARCH_PAGE_SIZE;
  if (!Number.isInteger(raw) || raw < 1 || raw > SEARCH_PAGE_SIZE_MAX) {
    throw new SearchCriteriaInvalidError(
      'limit',
      `Choose a page size between 1 and ${SEARCH_PAGE_SIZE_MAX}.`,
    );
  }
  return raw;
}

/**
 * Encode the last row's `(createdAt, id)` as an opaque cursor (D4).
 *
 * base64url of `"<iso>|<uuid>"`. Opaque is the point: clients pass it back
 * untouched rather than constructing it, so the tuple stays an implementation
 * detail we can change without breaking anyone.
 */
export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.id}`,
    'utf8',
  ).toString('base64url');
}

/** The inverse. Anything that does not decode to a real tuple is a `400` on
 * `cursor` — never a silent fall back to page one, which would loop a client
 * forever on the first page while looking like it was paging. */
export function decodeCursor(raw: string | undefined): SearchCursor | null {
  if (raw === undefined) return null;
  const invalid = new SearchCriteriaInvalidError(
    'cursor',
    'That page link is no longer valid. Start the search again.',
  );

  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    throw invalid;
  }

  const separator = decoded.lastIndexOf('|');
  if (separator === -1) throw invalid;

  const iso = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime()) || !UUID_RE.test(id)) {
    throw invalid;
  }
  return { createdAt, id };
}
