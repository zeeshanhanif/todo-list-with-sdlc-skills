import {
  formatDueDate,
  toDateTimeLocalValue,
  fromDateTimeLocalValue,
} from "@/lib/due-date";

// The first web-tier unit spec. It exists to prove the runner works against real
// shipped code — resolving the `@/` alias, running TS through next/jest — and it
// pays for itself: this module's date rules (FEAT-011 ui-design D4) were until
// now only reachable through Playwright, where the browser's timezone is
// whatever the machine says.
//
// FEAT-008 T9 rewrote these functions to take the zone EXPLICITLY (AC-8,
// FR-PROF-003, NFR-LOC-001), so every assertion below now names the zone it is
// asserting in and holds on any machine regardless of its TZ.
const KOLKATA = "Asia/Kolkata"; // +05:30, no DST — the half-hour case
const NEW_YORK = "America/New_York"; // DST, the transition case
const KATHMANDU = "Asia/Kathmandu"; // +05:45, the 45-minute case

describe("formatDueDate", () => {
  // 2026-07-29T09:00Z = 14:30 in Kolkata, 05:00 in New York.
  const now = new Date("2026-07-29T09:00:00.000Z");

  it("names the day for today, tomorrow and yesterday, in the given zone", () => {
    expect(formatDueDate("2026-07-29T06:00:00.000Z", KOLKATA, now)).toMatch(
      /^Today /,
    );
    expect(formatDueDate("2026-07-30T06:00:00.000Z", KOLKATA, now)).toMatch(
      /^Tomorrow /,
    );
    expect(formatDueDate("2026-07-28T06:00:00.000Z", KOLKATA, now)).toMatch(
      /^Yesterday /,
    );
  });

  it("AC-8: the SAME instant reads as different days in different zones", () => {
    // 2026-07-29T20:00Z is still the 29th in New York (16:00) but already the
    // 30th in Kolkata (01:30 the next morning). This is the whole point of
    // FR-PROF-003: without a stored zone, the answer depended on the device.
    const instant = "2026-07-29T20:00:00.000Z";
    expect(formatDueDate(instant, NEW_YORK, now)).toMatch(/^Today /);
    expect(formatDueDate(instant, KOLKATA, now)).toMatch(/^Tomorrow /);
  });

  it("appends a time only when one was set IN THAT ZONE", () => {
    // 18:30Z is exactly midnight in Kolkata (+05:30) — a whole day there...
    expect(formatDueDate("2026-07-29T18:30:00.000Z", KOLKATA, now)).toBe(
      "Tomorrow",
    );
    // ...and 14:30 in New York, which is a time.
    expect(formatDueDate("2026-07-29T18:30:00.000Z", NEW_YORK, now)).toMatch(
      /^Today .+/,
    );
  });

  it("uses the weekday inside the coming week and a date beyond it", () => {
    // Midnight IN KOLKATA on Aug 1 (+3 days) — so the weekday stands alone,
    // per design.md §6 and the "time only when one was set" rule below.
    expect(formatDueDate("2026-07-31T18:30:00.000Z", KOLKATA, now)).toBe("Sat");
    // The same day with a time set keeps the weekday and adds the clock.
    expect(formatDueDate("2026-08-01T06:00:00.000Z", KOLKATA, now)).toMatch(
      /^Sat .+/,
    );
    // +30 days — a month/day date.
    expect(formatDueDate("2026-08-28T06:00:00.000Z", KOLKATA, now)).toMatch(
      /Aug/,
    );
  });

  it("counts calendar days, not 24-hour spans", () => {
    // 23:00 → 01:00 next day, in the user's zone: two hours apart, one day.
    const lateEvening = new Date("2026-07-29T17:30:00.000Z"); // 23:00 Kolkata
    expect(
      formatDueDate("2026-07-29T19:30:00.000Z", KOLKATA, lateEvening),
    ).toMatch(/^Tomorrow /);
  });

  it("counts calendar days across a DST transition", () => {
    // US DST ends 2026-11-01. The 1st is a 25-hour day in New York; "tomorrow"
    // must still be tomorrow.
    const before = new Date("2026-10-31T18:00:00.000Z"); // 14:00 EDT, Oct 31
    expect(
      formatDueDate("2026-11-01T18:00:00.000Z", NEW_YORK, before),
    ).toMatch(/^Tomorrow /); // 13:00 EST, Nov 1
  });
});

describe("datetime-local round trip", () => {
  it("AC-8: renders the USER's wall clock, not UTC and not the machine's", () => {
    // 02:30Z is 08:00 in Kolkata — the design's own worked example.
    expect(toDateTimeLocalValue("2026-03-01T02:30:00.000Z", KOLKATA)).toBe(
      "2026-03-01T08:00",
    );
    expect(toDateTimeLocalValue("2026-03-01T02:30:00.000Z", NEW_YORK)).toBe(
      "2026-02-28T21:30",
    );
  });

  it("AC-8: sends the instant the user's wall clock names", () => {
    // 09:00 in Kolkata (+05:30) is 03:30Z — the design's stated expectation.
    expect(fromDateTimeLocalValue("2026-03-01T09:00", KOLKATA)).toBe(
      "2026-03-01T03:30:00.000Z",
    );
  });

  it.each([
    ["a half-hour zone", KOLKATA, "2026-03-01T09:00"],
    ["a 45-minute zone", KATHMANDU, "2026-03-01T09:00"],
    ["a whole-hour zone", NEW_YORK, "2026-03-01T09:00"],
    ["UTC itself", "UTC", "2026-03-01T09:00"],
  ])("round-trips through %s", (_label, zone, wall) => {
    expect(toDateTimeLocalValue(fromDateTimeLocalValue(wall, zone), zone)).toBe(
      wall,
    );
  });

  it.each([
    // US DST starts 2026-03-08 (02:00 -> 03:00) and ends 2026-11-01.
    ["the hour before a spring-forward", "2026-03-08T01:30"],
    ["the hour after a spring-forward", "2026-03-08T03:30"],
    ["the hour before a fall-back", "2026-11-01T00:30"],
    ["the hour after a fall-back", "2026-11-01T03:30"],
  ])("round-trips %s unchanged", (_label, wall) => {
    expect(
      toDateTimeLocalValue(fromDateTimeLocalValue(wall, NEW_YORK), NEW_YORK),
    ).toBe(wall);
  });

  it("keeps the instant stable across a value → instant → value cycle", () => {
    const original = "2026-07-29T14:05:00.000Z";
    expect(
      fromDateTimeLocalValue(
        toDateTimeLocalValue(original, KOLKATA),
        KOLKATA,
      ),
    ).toBe(original);
  });
});
