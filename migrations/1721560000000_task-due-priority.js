// Migration 009 — FEAT-011 (task detail). Two columns on `tasks`, both inside the
// conceptual entity the architecture already owns (Task, arch §8) — no new entity,
// no boundary change, no escalation. Migration 007 created `tasks` MINIMAL with the
// note "FEAT-010..014 extend it (due_at, priority, ...)"; this is that extension.
// See docs/features/FEAT-011-task-detail/technical-design.md §4.

exports.shorthands = undefined;

exports.up = (pgm) => {
  // FR-TASK-006 — optional due date/time. NULL = no due date, which is exactly
  // what "the due date/time is optional" means. An absolute instant
  // (timestamptz, stored UTC — NFR-LOC-001): the user's timezone interprets the
  // input and formats the output, it does not change the instant, which is why
  // overdue is timezone-invariant (technical-design D1).
  pgm.addColumns("tasks", { due_at: { type: "timestamptz" } });

  // FR-TASK-008 — priority. text + CHECK rather than a Postgres enum
  // (technical-design D6: no enum types exist in this schema, ALTER TYPE
  // migrations are worse than a constraint, and nothing sorts by priority).
  // NOT NULL DEFAULT 'none' is the FR's own stated default and backfills every
  // existing row in the same statement.
  pgm.addColumns("tasks", {
    priority: { type: "text", notNull: true, default: "none" },
  });
  pgm.addConstraint("tasks", "tasks_priority_check", {
    check: "priority IN ('none', 'low', 'medium', 'high')",
  });

  // NO INDEX here, deliberately (technical-design D7). The architecture's
  // (owner_id, due_at) index serves due-date FILTERING and bucketing — FR-SRCH-004
  // and the smart views, i.e. FEAT-015/016. Every statement FEAT-011 issues is
  // keyed on owner_id + id or owner_id + list_id and rides tasks_owner_list_idx
  // or the primary key. An index with no query is write cost bought for a feature
  // that has not reached the front.
};

exports.down = (pgm) => {
  pgm.dropConstraint("tasks", "tasks_priority_check"); // before its column
  pgm.dropColumns("tasks", ["priority", "due_at"]);
};
