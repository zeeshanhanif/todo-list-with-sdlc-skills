// Migration 008 — FEAT-009. Retires the walking skeleton's `skeleton_ping` table,
// created by migration 001 purely to prove the DB round-trip. docs/scaffold-notes.md
// (2026-07-21) planned this removal for "when the first real slice lands"; FEAT-009
// is the slice that needed `/` for itself, so the scaffolding goes with it
// (technical-design D7). `GET /healthz` liveness is untouched (NFR-OBS-002).

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.dropTable("skeleton_ping");
};

exports.down = (pgm) => {
  // Re-create exactly what migration 001 made, so the pair is reversible.
  pgm.createTable("skeleton_ping", {
    id: "id", // serial primary key
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
};
