import {
  formatDueDate,
  toDateTimeLocalValue,
  fromDateTimeLocalValue,
} from "@/lib/due-date";

// The first web-tier unit spec. It exists to prove the runner works against real
// shipped code — resolving the `@/` alias, running TS through next/jest — and it
// pays for itself: this module's local-time rules (FEAT-011 ui-design D4) were
// until now only reachable through Playwright, where the browser's timezone is
// whatever the machine says. Dates are built from local parts on purpose, so the
// assertions hold in any TZ.
const localDate = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min);
const iso = (...args: Parameters<typeof localDate>) =>
  localDate(...args).toISOString();

describe("formatDueDate", () => {
  const now = localDate(2026, 7, 29, 9, 0);

  it("names the day for today, tomorrow and yesterday", () => {
    expect(formatDueDate(iso(2026, 7, 29), now)).toBe("Today");
    expect(formatDueDate(iso(2026, 7, 30), now)).toBe("Tomorrow");
    expect(formatDueDate(iso(2026, 7, 28), now)).toBe("Yesterday");
  });

  it("appends a time only when one was set", () => {
    // Exactly local midnight reads as a whole day, never "Today at 12:00 AM".
    expect(formatDueDate(iso(2026, 7, 29, 0, 0), now)).toBe("Today");
    expect(formatDueDate(iso(2026, 7, 29, 17, 30), now)).toMatch(/^Today .+/);
  });

  it("uses the weekday inside the coming week and a date beyond it", () => {
    // +3 days — a weekday name, not "Aug 1".
    expect(formatDueDate(iso(2026, 8, 1), now)).toMatch(/^[A-Z][a-z]{2}$/);
    // +30 days — a month/day date.
    expect(formatDueDate(iso(2026, 8, 28), now)).toMatch(/Aug/);
  });

  it("counts calendar days, not 24-hour spans", () => {
    // 11pm today → 1am tomorrow is two hours apart and one calendar day apart.
    const lateEvening = localDate(2026, 7, 29, 23, 0);
    expect(formatDueDate(iso(2026, 7, 30, 1, 0), lateEvening)).toMatch(
      /^Tomorrow /,
    );
  });
});

describe("datetime-local round trip", () => {
  it("renders the browser's wall clock, not UTC", () => {
    expect(toDateTimeLocalValue(iso(2026, 7, 29, 14, 5))).toBe(
      "2026-07-29T14:05",
    );
  });

  it("returns the same instant after a round trip", () => {
    const original = iso(2026, 7, 29, 14, 5);
    expect(fromDateTimeLocalValue(toDateTimeLocalValue(original))).toBe(
      original,
    );
  });
});
