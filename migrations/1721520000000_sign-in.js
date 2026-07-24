// Migration 005 — FEAT-003 (sign in: session, lockout, rate-limit).
// Creates `sessions` (Session entity, ADR-005 — opaque token, hash-at-rest),
// `audit_log` (security events, NFR-SEC-009), and `auth_rate_buckets` (per-IP
// fixed-window throttle infra, FR-AUTH-018); adds lockout columns to `users`
// (physical realization within the User entity, FR-AUTH-019). All timestamps
// timestamptz, UTC (NFR-LOC-001); UUID PKs via gen_random_uuid() (no extension,
// C-6). See docs/features/FEAT-003-sign-in/technical-design.md §4.

exports.shorthands = undefined;

exports.up = (pgm) => {
  // --- sessions (conceptual entity: Session; ADR-005) ---
  pgm.createTable("sessions", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE", // delete-account terminates sessions (FR-DATA-005)
    },
    token_hash: { type: "text", notNull: true }, // SHA-256(raw) hex; raw never stored (NFR-SEC-007)
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    last_used_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    expires_at: { type: "timestamptz", notNull: true }, // now()+TTL (FR-AUTH-016)
  });
  pgm.createIndex("sessions", "token_hash", {
    unique: true,
    name: "sessions_token_hash_key",
  });
  pgm.createIndex("sessions", "user_id", { name: "sessions_user_id_idx" });

  // --- users: lockout state (physical, within User entity; FR-AUTH-019) ---
  pgm.addColumns("users", {
    failed_login_count: { type: "integer", notNull: true, default: 0 },
    locked_until: { type: "timestamptz" }, // NULL = not locked
  });

  // --- audit_log (conceptual entity: audit_log; NFR-SEC-009) ---
  pgm.createTable("audit_log", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: {
      type: "uuid",
      references: "users(id)",
      onDelete: "SET NULL", // preserve the security log past account deletion
    },
    event: { type: "text", notNull: true }, // sign_in_success | sign_in_failure | ...
    ip: { type: "text" },
    detail: { type: "jsonb" }, // reason category only — never credentials
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("audit_log", "created_at", { name: "audit_log_created_at_idx" });
  pgm.createIndex("audit_log", "user_id", { name: "audit_log_user_id_idx" });

  // --- auth_rate_buckets (infra: per-IP fixed-window counter; FR-AUTH-018) ---
  pgm.createTable("auth_rate_buckets", {
    ip: { type: "text", notNull: true },
    route: { type: "text", notNull: true },
    window_start: { type: "timestamptz", notNull: true },
    count: { type: "integer", notNull: true, default: 0 },
  });
  pgm.addConstraint("auth_rate_buckets", "auth_rate_buckets_pkey", {
    primaryKey: ["ip", "route", "window_start"],
  });
};

exports.down = (pgm) => {
  pgm.dropTable("auth_rate_buckets");
  pgm.dropTable("audit_log");
  pgm.dropColumns("users", ["failed_login_count", "locked_until"]);
  pgm.dropTable("sessions");
};
