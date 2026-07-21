// Migration 001 — initializes the migration MECHANISM and the single table the
// walking skeleton reads and writes. Real domain schema (users, lists, tasks,
// sessions, email_outbox, audit_log — architecture §5) arrives per-slice via
// detailed-design; this table exists only to prove the DB round-trip.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("skeleton_ping", {
    id: "id", // serial primary key
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("skeleton_ping");
};
