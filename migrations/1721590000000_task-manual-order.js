// Migration 012 — FEAT-014 (manual task order). ONE COLUMN and its backfill, no
// tables and NO INDEX: `tasks.position`, the rank FR-TASK-012's manual
// arrangement lives in, inside the Task entity the conceptual model already owns
// (arch §8 Data). See docs/features/FEAT-014-reorder-tasks/technical-design.md §4.
//
// No index by decision, not by omission (D9): `tasks_active_by_list_idx`
// (migration 007, partial on list_id) already narrows the list view to one
// list's active rows, and the sort has been an unindexed top-N over that handful
// since FEAT-010 — changing the ORDER BY key from created_at to position does not
// change the plan shape or the row count. T9 measures; the index gets added then,
// with the number that justifies it, or not at all.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("tasks", {
    position: { type: "integer", notNull: true, default: 0 },
  });

  // Backfill: dense 0..n-1 per (owner_id, list_id), oldest first.
  //
  // `created_at ASC, id ASC` is not an arbitrary choice — it is EXACTLY the order
  // TasksRepository.findByList returns active tasks in today (FEAT-010 D4), so
  // every existing list keeps the order it already has and this migration is
  // invisible to users and to FEAT-010/011/012/013's verified tests (AC-13).
  //
  // It ranks ALL of the list's rows, completed and soft-deleted included, so no
  // two rows in a list share a position at rest. That is what makes a reopen (D4)
  // and a restore land somewhere deterministic rather than colliding with an
  // active row — the reorder endpoint only ever renumbers the ACTIVE set (D3),
  // so the completed rows' numbers have to be right from the start.
  pgm.sql(`
    UPDATE tasks AS t
    SET position = ranked.rank - 1
    FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY owner_id, list_id ORDER BY created_at ASC, id ASC
      ) AS rank
      FROM tasks
    ) AS ranked
    WHERE t.id = ranked.id
  `);
};

exports.down = (pgm) => {
  // The manual order itself is lost, which is what dropping it means. Nothing
  // outside this feature reads the column.
  pgm.dropColumns("tasks", ["position"]);
};
