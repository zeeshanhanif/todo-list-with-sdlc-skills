// Migration 004 — FEAT-002 (verify email + resend). Adds a lookup index on
// users.verification_token_hash so POST /auth/verify resolves the token to a
// user by a point lookup as the table grows. Partial: only unverified/live rows
// carry a non-NULL hash (consumed tokens are cleared to NULL). Physical
// realization within the existing User entity — no new entity, no columns added
// (verified_at / verification_token_hash / verification_token_expires_at already
// exist from migration 002). See docs/features/FEAT-002-verify-email/technical-design.md §4.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createIndex("users", "verification_token_hash", {
    name: "users_verification_token_hash_idx",
    where: "verification_token_hash IS NOT NULL",
  });
};

exports.down = (pgm) => {
  pgm.dropIndex("users", "verification_token_hash", {
    name: "users_verification_token_hash_idx",
  });
};
