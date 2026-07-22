// Migration 003 — FEAT-007 (email delivery). Extends the existing email_outbox
// (EmailOutbox entity, architecture §5) with retry/backoff/dead-letter columns
// so the worker can drain, retry, and dead-letter (ADR-007, SW-002). Physical
// realization only — no new entity. See docs/features/FEAT-007-email-delivery/
// technical-design.md §4.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("email_outbox", {
    attempts: { type: "integer", notNull: true, default: 0 },
    next_attempt_at: { type: "timestamptz" }, // NULL = due immediately
    sent_at: { type: "timestamptz" },
    last_error: { type: "text" },
  });
  // Partial index for the claim query (pending + due).
  pgm.createIndex("email_outbox", "next_attempt_at", {
    name: "email_outbox_due_idx",
    where: "status = 'pending'",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("email_outbox", "next_attempt_at", {
    name: "email_outbox_due_idx",
  });
  pgm.dropColumns("email_outbox", [
    "attempts",
    "next_attempt_at",
    "sent_at",
    "last_error",
  ]);
};
