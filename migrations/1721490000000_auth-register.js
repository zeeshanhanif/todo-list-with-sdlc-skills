// Migration 002 — FEAT-001 (register). Creates the first domain tables:
// users (full), lists (minimal — FEAT-009 extends), email_outbox (minimal —
// FEAT-007 extends). See docs/features/FEAT-001-register/technical-design.md §4.
// UUID PKs via gen_random_uuid() — core in Postgres 13+, no extension (C-6).
// All timestamps timestamptz, stored UTC (NFR-LOC-001).

exports.shorthands = undefined;

exports.up = (pgm) => {
  // --- users (conceptual entity: User) ---
  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    email: { type: "text", notNull: true }, // normalized (trim+lowercase) in app
    password_hash: { type: "text", notNull: true }, // Argon2id (NFR-SEC-005)
    verified_at: { type: "timestamptz" }, // NULL = unverified
    verification_token_hash: { type: "text" }, // SHA-256 of raw token (FR-AUTH-005)
    verification_token_expires_at: { type: "timestamptz" }, // now()+24h (NFR-SEC-004)
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("users", "email", { unique: true, name: "users_email_key" });

  // --- lists (conceptual entity: List) — minimal; FEAT-009 extends ---
  pgm.createTable("lists", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    owner_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE",
    },
    name: { type: "text", notNull: true },
    is_default: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("lists", "owner_id", { name: "lists_owner_id_idx" });

  // --- email_outbox (conceptual entity: EmailOutbox) — minimal; FEAT-007 extends ---
  pgm.createTable("email_outbox", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    type: { type: "text", notNull: true }, // 'verification'
    recipient: { type: "text", notNull: true },
    payload: { type: "jsonb", notNull: true }, // { token, userId }
    status: { type: "text", notNull: true, default: "pending" }, // pending|sent|failed
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("email_outbox");
  pgm.dropTable("lists");
  pgm.dropTable("users");
};
