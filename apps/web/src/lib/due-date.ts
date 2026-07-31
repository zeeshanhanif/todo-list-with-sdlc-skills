// Due-date presentation, shared by SCR-WEB-008's task-row chip and SCR-WEB-010's
// detail (FEAT-011 ui-design D4 — the two surfaces format the same value, so
// they format it with the same code).
//
// **Timezone**: every function here takes the zone EXPLICITLY, and callers pass
// the account's effective zone from `useTimeZone()` (FEAT-008 technical-design
// §5.3). Until FEAT-008 these functions read the browser's zone, which made
// "Today" mean different days on a user's laptop and their phone — FR-PROF-003's
// "shall use it to compute due-date" is exactly that defect being closed.
//
// The wire value is always an ISO-8601 UTC instant; nothing here changes that
// instant, only how it reads. `isOverdue` is deliberately NOT computed here: it
// is server-derived from an instant comparison, and its answer is the same in
// every zone (FEAT-011 D1/D3, FEAT-008 D4). Changing your timezone must not make
// a task stop being late.

/** Wall-clock parts of an instant in a named zone — the primitive the rest of
 * this module is built on. `Date`'s own getters would answer for the machine's
 * zone, which is the whole thing we are moving off. */
function zonedParts(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // `hour12: false` renders midnight as 24 in some ICU versions; normalize it
    // so "is this exactly midnight?" has one answer.
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/** design.md §6: "Dates human-friendly ('Today', 'Tomorrow', 'Fri', 'Mar 3')". */
export function formatDueDate(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const due = new Date(iso);
  const days = calendarDaysBetween(now, due, timeZone);

  if (days === 0) return `Today${atTime(due, timeZone)}`;
  if (days === 1) return `Tomorrow${atTime(due, timeZone)}`;
  if (days === -1) return `Yesterday${atTime(due, timeZone)}`;
  // Within the coming week, the weekday alone is the most readable form.
  if (days > 1 && days < 7) {
    return `${due.toLocaleDateString(undefined, {
      weekday: "short",
      timeZone,
    })}${atTime(due, timeZone)}`;
  }
  const sameYear =
    zonedParts(due, timeZone).year === zonedParts(now, timeZone).year;
  return due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone,
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Whole calendar days from `from` to `to` **in the given zone** — not a
 * millisecond division, which would call 11pm→1am "tomorrow" only sometimes. */
function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  const a = zonedParts(from, timeZone);
  const b = zonedParts(to, timeZone);
  // Both midpoints are built as UTC noon from the ZONED calendar date, so the
  // subtraction counts calendar days and cannot be knocked off by a DST day
  // that is 23 or 25 hours long.
  const dayA = Date.UTC(a.year, a.month - 1, a.day, 12);
  const dayB = Date.UTC(b.year, b.month - 1, b.day, 12);
  return Math.round((dayB - dayA) / 86_400_000);
}

/** Times are shown only when the user set one — a due date at exactly midnight
 * **in their zone** reads as a whole day, not "Today at 12:00 AM". */
function atTime(due: Date, timeZone: string): string {
  const { hour, minute } = zonedParts(due, timeZone);
  if (hour === 0 && minute === 0) return "";
  return ` ${due.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })}`;
}

/** The `<input type="datetime-local">` value for an instant, in the user's zone.
 * `toISOString()` would render UTC and silently shift what the user sees, so the
 * zoned parts are assembled by hand. */
export function toDateTimeLocalValue(iso: string, timeZone: string): string {
  const { year, month, day, hour, minute } = zonedParts(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/**
 * The inverse: a `datetime-local` value is wall-clock in the USER'S zone, and
 * this returns the instant that wall clock names (NFR-LOC-001 — UTC on the wire,
 * always).
 *
 * Solved in two passes. Read the wall clock as if it were UTC to get a first
 * guess, measure the zone's offset there, and correct; then measure the offset
 * *at the corrected instant* and correct again. The second pass is what makes
 * values near a DST transition land right — one pass uses the offset from the
 * wrong side of the boundary. Two passes converge for every real zone, because
 * offsets shift by an hour or two and never by enough to re-cross.
 */
export function fromDateTimeLocalValue(
  value: string,
  timeZone: string,
): string {
  const guess = Date.parse(`${value}:00.000Z`);
  const offsetAt = (instant: number): number => {
    const p = zonedParts(new Date(instant), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instant;
  };
  const firstPass = guess - offsetAt(guess);
  return new Date(guess - offsetAt(firstPass)).toISOString();
}
