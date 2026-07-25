// Migration 006 — FEAT-005 (forgot / reset password). Adds reset-token columns to
// `users` (physical realization within the User entity, mirroring the verification
// token columns from migration 002/004) plus a partial lookup index on the live
// token hash. No new entity. Single-use, time-limited per NFR-SEC-004 (1h).
// See docs/features/FEAT-005-reset-password/technical-design.md §4.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("users", {
    reset_token_hash: { type: "text" }, // SHA-256(raw) hex; NULL when no reset pending
    reset_token_expires_at: { type: "timestamptz" }, // now()+1h (NFR-SEC-004)
  });
  pgm.createIndex("users", "reset_token_hash", {
    name: "users_reset_token_hash_idx",
    where: "reset_token_hash IS NOT NULL",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("users", "reset_token_hash", {
    name: "users_reset_token_hash_idx",
  });
  pgm.dropColumns("users", ["reset_token_hash", "reset_token_expires_at"]);
};
