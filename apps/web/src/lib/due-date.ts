// Due-date presentation, shared by SCR-WEB-008's task-row chip and SCR-WEB-010's
// detail (FEAT-011 ui-design D4 — the two surfaces format the same value, so
// they format it with the same code).
//
// **Timezone**: every function here interprets and renders in the BROWSER's
// timezone, which is FR-PROF-003's own stated default until FEAT-008 stores one
// (technical-design D1/§8). The wire value is always an ISO-8601 UTC instant;
// nothing here changes that instant, only how it reads.

/** design.md §6: "Dates human-friendly ('Today', 'Tomorrow', 'Fri', 'Mar 3')". */
export function formatDueDate(iso: string, now: Date = new Date()): string {
  const due = new Date(iso);
  const days = calendarDaysBetween(now, due);

  if (days === 0) return `Today${atTime(due)}`;
  if (days === 1) return `Tomorrow${atTime(due)}`;
  if (days === -1) return `Yesterday${atTime(due)}`;
  // Within the coming week, the weekday alone is the most readable form.
  if (days > 1 && days < 7) {
    return `${due.toLocaleDateString(undefined, { weekday: "short" })}${atTime(due)}`;
  }
  const sameYear = due.getFullYear() === now.getFullYear();
  return due.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Whole calendar days from `from` to `to` in local time — not a millisecond
 * division, which would call 11pm→1am "tomorrow" only sometimes. */
function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Times are shown only when the user set one — a due date at exactly local
 * midnight reads as a whole day, not "Today at 12:00 AM". */
function atTime(due: Date): string {
  if (due.getHours() === 0 && due.getMinutes() === 0) return "";
  return ` ${due.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** The `<input type="datetime-local">` value for an instant, in the browser's
 * timezone. `toISOString()` would render UTC and silently shift what the user
 * sees, so the local parts are assembled by hand. */
export function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** The inverse: a `datetime-local` value is wall-clock in the browser's zone;
 * `new Date(...)` reads it as local and `toISOString()` gives the instant the
 * contract wants (NFR-LOC-001 — UTC on the wire, always). */
export function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}
