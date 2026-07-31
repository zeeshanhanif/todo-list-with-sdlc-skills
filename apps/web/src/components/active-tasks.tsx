"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskSummary } from "@todo/shared";
import { TaskRow } from "@/components/task-row";

// SCR-WEB-008's active section (FEAT-014 ui-design) — the reorder island.
// The ONLY part of the list view that needs client state; the header, the empty
// states and the completed <details> stay server-rendered, keeping FEAT-012 D5's
// zero-JS property (ui-design D3).
//
// **One control, three affordances** (ui-design D1), because no single one of
// them satisfies all four constraints: UC-010 says the user "drags the task",
// design.md §4 puts a handle on `task-row` at `≥lg`, design.md §5 requires
// drag-reorder to have a keyboard alternative AND says arrow keys move within
// lists, and AC-12 fails the feature outright if the affordance is pointer-only.
// So the handle is draggable at `≥lg`, moves the row on ArrowUp/ArrowDown while
// focused, and toggles an inline moving state (▲/▼, disabled at the ends) that
// touch and small viewports can use. One added tab stop per row.
//
// **Optimistic with rollback** (ui-design D2): the rows move immediately and
// snap back if the write fails, because a reorder that waits for a round trip
// reads as a broken drag. This is the `task-checkbox.tsx` contract — optimistic
// about what the control itself owns, which here is a permutation of an array
// already on screen. A 400 means the server's active set no longer matches ours
// (someone completed or deleted a task on another device), so that path also
// refreshes.
//
// No drag library (ui-design D4): native HTML5 drag-and-drop, a few dozen lines,
// and `apps/web` keeps its three dependencies.
// All values are design tokens.

export function ActiveTasks({
  listId,
  tasks,
}: {
  listId: string;
  tasks: TaskSummary[];
}) {
  const router = useRouter();
  // Optimistic local truth. `tasks` is the server's; while a write is in flight
  // the two differ, and after `router.refresh()` they agree again.
  const [order, setOrder] = useState<TaskSummary[] | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // The server is the truth: once new rows arrive, the optimistic copy is
  // discarded rather than merged (D2 — a second renderer of the list is what
  // this island must never become).
  //
  // Adjusted DURING RENDER rather than in an effect. React 19's lint rule
  // rejects a synchronous setState inside an effect (it triggers a cascading
  // render), and this is the pattern React documents for resetting state when a
  // prop changes: compare against the last props value and set both. The extra
  // render happens before the browser paints, so no stale order is ever shown.
  const [serverTasks, setServerTasks] = useState(tasks);
  if (serverTasks !== tasks) {
    setServerTasks(tasks);
    setOrder(null);
  }

  const rows = order ?? tasks;
  // Fewer than two active tasks: there is nothing to reorder, so no handle is
  // rendered at all rather than one whose every action is disabled (ui-design).
  const reorderable = rows.length > 1;

  async function persist(next: TaskSummary[], movedId: string) {
    const previous = rows;
    const index = next.findIndex((t) => t.id === movedId);
    setOrder(next);
    setError(null);
    setAnnouncement(
      `Moved ${next[index].title} to ${index + 1} of ${next.length}.`,
    );
    try {
      const res = await fetch(`/api/lists/${listId}/tasks/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskIds: next.map((t) => t.id) }),
      });
      if (res.status === 401) {
        window.location.assign("/signin");
        return;
      }
      if (!res.ok) {
        // Roll back to the last order the server confirmed — the rendered order
        // and the stored order never diverge silently (AC-15).
        setOrder(previous);
        setError("Couldn't save the new order.");
        setAnnouncement("");
        // A 400 means our vector no longer matches the server's active set, so
        // the list itself is stale: replace it rather than leave it.
        if (res.status === 400) {
          router.refresh();
        }
        return;
      }
      // The server components behind this island re-render; the render-phase
      // adjustment above then drops the optimistic copy in favour of the rows
      // that came back.
      router.refresh();
    } catch {
      setOrder(previous);
      setError("Couldn't save the new order.");
      setAnnouncement("");
    }
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    void persist(next, rows[index].id);
  }

  function dropOn(targetIndex: number) {
    const fromIndex = rows.findIndex((t) => t.id === dragging);
    setDragging(null);
    setDropTarget(null);
    if (fromIndex < 0) return;
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    // Removing the row first shifts everything after it down by one, so a drop
    // onto a LATER row lands one short without this correction.
    next.splice(fromIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, moved);
    // A drop that produces the order we already have is a NO-OP, and the guard
    // has to compare the RESULT rather than the indices: dropping a row on the
    // one just after it is `fromIndex !== targetIndex` yet lands the row exactly
    // where it started, because the indicator sits on the target's leading edge.
    // Without this, that drop spent a write AND announced "Moved X to N of M"
    // for a move that never happened — a false statement to the one audience
    // that cannot see the list did not change (FEAT-014 acceptance R2).
    if (next.every((task, i) => task.id === rows[i].id)) return;
    void persist(next, moved.id);
  }

  return (
    <>
      <ul data-testid="active-tasks" style={sectionStyle}>
        {rows.map((task, index) => (
          <TaskRow
            key={task.id}
            task={task}
            dragging={dragging === task.id}
            dropTarget={dropTarget === task.id}
            onDragOver={
              reorderable
                ? (e) => {
                    e.preventDefault();
                    setDropTarget(task.id);
                  }
                : undefined
            }
            onDrop={
              reorderable
                ? (e) => {
                    e.preventDefault();
                    dropOn(index);
                  }
                : undefined
            }
            handle={
              reorderable ? (
                <ReorderControls
                  task={task}
                  index={index}
                  total={rows.length}
                  moving={moving === task.id}
                  onToggleMoving={() =>
                    setMoving(moving === task.id ? null : task.id)
                  }
                  onMove={(delta) => move(index, delta)}
                  onDragStart={() => {
                    setDragging(task.id);
                    setMoving(null);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                />
              ) : undefined
            }
          />
        ))}
      </ul>

      {/* The only feedback a keyboard or screen-reader user gets that the move
          landed (design.md §5: aria-live for async results). Deliberately NOT a
          toast — design.md §4 describes one toast region and two hosts already
          exist (ui-design escalations); this must not become a third. */}
      <div
        role="status"
        aria-live="polite"
        data-testid="reorder-announcement"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announcement}
      </div>

      {error && (
        <p
          role="alert"
          data-testid="reorder-error"
          style={{
            margin: "var(--space-2) 0 0",
            fontSize: "var(--font-size-small)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </p>
      )}
    </>
  );
}

/** design.md §4's `icon-button`, carrying the three affordances of ui-design D1.
 * The glyphs are text with `aria-hidden` and the meaning on the button's
 * `aria-label` — the project's carried no-icon-library deviation, the same
 * treatment `lists-nav.tsx`'s `⋯` and `+` already use. */
function ReorderControls({
  task,
  index,
  total,
  moving,
  onToggleMoving,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  task: TaskSummary;
  index: number;
  total: number;
  moving: boolean;
  onToggleMoving: () => void;
  onMove: (delta: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <span style={{ display: "flex", alignItems: "center" }}>
      {moving && (
        <>
          <button
            type="button"
            data-testid="move-up"
            aria-label={`Move up: ${task.title}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            style={iconButton(index === 0)}
          >
            <span aria-hidden="true">▲</span>
          </button>
          <button
            type="button"
            data-testid="move-down"
            aria-label={`Move down: ${task.title}`}
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            style={iconButton(index === total - 1)}
          >
            <span aria-hidden="true">▼</span>
          </button>
        </>
      )}
      <button
        type="button"
        data-testid="reorder-handle"
        aria-label={`Reorder: ${task.title}`}
        aria-pressed={moving}
        // Drag is the ≥lg pointer path; the keyboard paths below work at every
        // width, which is what design.md §5 requires and what the filed §4
        // amendment makes explicit (ui-design escalations).
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onToggleMoving}
        onKeyDown={(e) => {
          // Arrow keys act directly on the focused handle — no mode needed —
          // and focus stays on the handle, which travels with the row, so a
          // second press keeps moving the SAME task (ui-design).
          if (e.key === "ArrowUp") {
            e.preventDefault();
            onMove(-1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onMove(1);
          } else if (e.key === "Escape" && moving) {
            e.preventDefault();
            onToggleMoving();
          }
        }}
        style={{ ...iconButton(false), cursor: "grab" }}
      >
        <span aria-hidden="true">⠿</span>
      </button>
    </span>
  );
}

const sectionStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
};

// design.md §4's `icon-button` is "40px (44px TOUCH) square", and §5 requires
// >= 44x44 on touch viewports. `apps/web` has no coarse-pointer rule, so the
// control is ONE size everywhere and that size has to be the touch one —
// the call `shell-frame.tsx` and `detail-panel.tsx` already made. Guarded by
// `e2e/tests/touch-target.spec.ts`.
const iconButton = (disabled: boolean) => ({
  minWidth: "var(--size-touch-target)",
  minHeight: "var(--size-touch-target)",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "transparent",
  color: "var(--color-text-muted)",
  fontSize: "var(--font-size-body)",
  lineHeight: 1,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.45 : 1,
});
