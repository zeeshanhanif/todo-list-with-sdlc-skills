// Migration 007 — FEAT-009 (list management). Two physical changes inside
// entities the architecture's conceptual model already owns (no new entity):
//   a) `lists.position` — manual ordering, persisted across devices (FR-LIST-008).
//   b) `tasks` — created MINIMAL, the way migration 002 created `lists` minimal for
//      FEAT-001. FEAT-010..014 extend it (due_at, priority, ordering, validation).
//      It exists now because FR-LIST-007's delete-cascade and FR-LIST-005's
//      *active*-task counts are undemonstrable without it (technical-design D1),
//      and FR-LIST-009's "exactly one list" is the NOT NULL + FK below.
// See docs/features/FEAT-009-lists/technical-design.md §4.

exports.shorthands = undefined;

exports.up = (pgm) => {
  // --- a) lists.position (FR-LIST-008) ---
  pgm.addColumns("lists", {
    position: { type: "integer", notNull: true, default: 0 },
  });

  // Backfill: dense 0..n-1 per owner, oldest first. Existing Inbox rows land at 0.
  pgm.sql(`
    UPDATE lists AS l
    SET position = ranked.rank - 1
    FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY owner_id ORDER BY created_at ASC, id ASC
      ) AS rank
      FROM lists
    ) AS ranked
    WHERE l.id = ranked.id
  `);

  // Serves the GET /lists sort (position ASC, created_at ASC).
  pgm.createIndex("lists", ["owner_id", "position"], {
    name: "lists_owner_position_idx",
  });

  // --- b) tasks (conceptual entity: Task) — minimal; FEAT-010+ extend ---
  pgm.createTable("tasks", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    owner_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE",
    },
    // NOT NULL + FK = FR-LIST-009 (a task belongs to exactly one list);
    // ON DELETE CASCADE = FR-LIST-007 (deleting a list permanently deletes its tasks).
    list_id: {
      type: "uuid",
      notNull: true,
      references: "lists(id)",
      onDelete: "CASCADE",
    },
    title: { type: "text", notNull: true }, // FEAT-010 owns its validation
    completed_at: { type: "timestamptz" }, // NULL = active (FR-LIST-005; FEAT-012 writes it)
    deleted_at: { type: "timestamptz" }, // soft delete (arch §8 Data; FEAT-013 writes it)
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // The architecture's named ownership index (arch §8 Performance).
  pgm.createIndex("tasks", ["owner_id", "list_id"], {
    name: "tasks_owner_list_idx",
  });
  // The partial index GET /lists' active-count aggregate rides (NFR-PERF-001).
  pgm.createIndex("tasks", "list_id", {
    name: "tasks_active_by_list_idx",
    where: "completed_at IS NULL AND deleted_at IS NULL",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("tasks"); // drops its indexes with it
  pgm.dropIndex("lists", ["owner_id", "position"], {
    name: "lists_owner_position_idx",
  });
  pgm.dropColumns("lists", ["position"]);
};
