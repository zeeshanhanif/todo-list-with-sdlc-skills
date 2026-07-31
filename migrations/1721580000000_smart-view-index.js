// Migration 011 — FEAT-016 (smart views). ONE INDEX, no columns and no tables:
// the architecture's own `(owner_id, due_at)` index (arch §8 Performance), which
// FEAT-011 D7 deferred to "FEAT-015/016" and FEAT-015 D3 correctly declined for
// keyword search — whose ILIKE-on-title, order-by-created shape it cannot serve.
// This is the shape it was named for. See
// docs/features/FEAT-016-smart-views/technical-design.md §4 and D3.

exports.shorthands = undefined;

exports.up = (pgm) => {
  // PARTIAL, matching `tasks_active_by_list_idx`'s convention in this schema:
  // every smart view is active-only by FR-SRCH-008, so the predicate is implied
  // by every query the index exists to serve, and completed or soft-deleted rows
  // buy nothing by sitting in it (2,264 kB partial vs 2,816 kB plain on the
  // design probe, identical timings).
  //
  // It serves `upcoming`, `overdue` and their deep cursor pages as an index scan
  // reading one page's worth of rows, instead of a bitmap scan over the owner's
  // whole active set followed by a top-N sort — work that grows with the page
  // rather than with the user's corpus (technical-design D3 carries the numbers).
  //
  // `today` and `all` deliberately do NOT use it: `today`'s predicate is an
  // expression over due_at ((due_at AT TIME ZONE tz)::date, which stays a cast
  // for DST correctness — D4) and is therefore not sargable, and `all` has no
  // due predicate and sorts by created_at. Both were measured; neither is a plan
  // to be "fixed" later.
  pgm.createIndex("tasks", ["owner_id", "due_at"], {
    name: "tasks_owner_due_idx",
    where: "completed_at IS NULL AND deleted_at IS NULL",
  });
};

exports.down = (pgm) => {
  // Nothing depends on this index for correctness — only for the plan shape,
  // which is exactly why dropping it is safe.
  pgm.dropIndex("tasks", ["owner_id", "due_at"], {
    name: "tasks_owner_due_idx",
  });
};
