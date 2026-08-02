// Migration 013 — FEAT-020 (soft-deleted task purge). ONE INDEX, no columns and
// no tables: the retention-sweep index FEAT-013 D-note deferred to this feature
// ("FEAT-020 will scan WHERE deleted_at < now() - interval '30 days' and that
// feature owns the index decision"). See
// docs/features/FEAT-020-purge-job/technical-design.md §4 and D5.

exports.shorthands = undefined;

exports.up = (pgm) => {
  // PARTIAL, matching `tasks_active_by_list_idx` and `tasks_owner_due_idx`'s
  // convention in this schema — but with the opposite predicate: this is the one
  // index that exists FOR the soft-deleted rows every other index excludes.
  //
  // The predicate is what keeps it small. Soft-deleted rows are a minority of
  // `tasks` at any instant (they live at most TASK_RETENTION_DAYS and most tasks
  // are never deleted), so the partial index carries a handful of entries and is
  // written to only on delete and restore, where a plain index on `deleted_at`
  // would carry a NULL entry per task for a scan that only ever wants non-NULLs.
  //
  // `deleted_at` as the key gives the purge's `deleted_at < :cutoff` as a range
  // scan in oldest-first order — which is also the order the purge batches in, so
  // successive batches are sequential ranges rather than repeated re-scans.
  //
  // Unlike the two indexes above, this one is not a plan optimisation for a user
  // request: without it the every-minute job seq-scans the WHOLE tasks table —
  // every task of every user — to find a few expired rows, and that cost grows
  // with the corpus while the result set does not (D5). T6 measures it.
  pgm.createIndex("tasks", ["deleted_at"], {
    name: "tasks_purge_due_idx",
    where: "deleted_at IS NOT NULL",
  });
};

exports.down = (pgm) => {
  // Exactly lossless: this migration adds no data and destroys none, so dropping
  // the index reverts it completely — only the purge's plan shape changes back.
  pgm.dropIndex("tasks", ["deleted_at"], {
    name: "tasks_purge_due_idx",
  });
};
