// Migration 010 — FEAT-008 (profile & settings). Three columns on `users`, all
// inside the conceptual entity the architecture already owns (User, arch §8; the
// `profile` capability area of §5) — no new entity, no boundary change, no
// escalation. See docs/features/FEAT-008-profile/technical-design.md §4.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("users", {
    // FR-PROF-002 — NULL = never set. The default display name is DERIVED at
    // read time (technical-design D1, `displayNameFor` in @todo/shared), never
    // backfilled, so "did the user choose this?" stays answerable and the
    // fallback follows the email instead of drifting from it.
    display_name: { type: "text" },

    // FR-PROF-003 — an IANA zone id as the user chose it. Stored VERBATIM: the
    // API's ICU and the browser's canonicalize aliases in opposite directions
    // (Node 22/ICU 77 resolves Asia/Kolkata -> Asia/Calcutta; browsers resolve
    // the reverse), so a server that re-canonicalized would hand the settings
    // picker a zone id absent from its own option list (technical-design D2).
    // NULL = not yet established; the effective zone is COALESCE(timezone,
    // 'UTC'), which is the FR's own "falls back to UTC". No DB-side CHECK: the
    // valid set is the runtime's ICU database, which Postgres does not share.
    timezone: { type: "text" },

    // FR-PROF-004 — NOT NULL DEFAULT 'system' is the FR's own stated default
    // ("match system") and backfills every existing row in the same statement.
    theme: { type: "text", notNull: true, default: "system" },
  });

  // text + CHECK, matching migration 009's `tasks_priority_check` — this schema
  // has no Postgres enum types and FEAT-011 D6 recorded why (ALTER TYPE
  // migrations are worse than a constraint).
  pgm.addConstraint("users", "users_theme_check", {
    check: "theme IN ('light', 'dark', 'system')",
  });

  // NO INDEX, deliberately (technical-design §4). Every statement this feature
  // issues is `WHERE id = $1` on the primary key; an index on a preference
  // column would be write cost bought for a query nobody makes (FEAT-011 D7's
  // rule).
};

exports.down = (pgm) => {
  pgm.dropConstraint("users", "users_theme_check"); // before its column
  pgm.dropColumns("users", ["theme", "timezone", "display_name"]);
};
