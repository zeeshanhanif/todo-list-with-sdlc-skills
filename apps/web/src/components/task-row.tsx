"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { TaskSummary } from "@todo/shared";
import { DueChip, PriorityDot } from "@/components/task-meta";
import { TaskCheckbox } from "@/components/task-checkbox";

// design.md §4's `task-row`, extracted from list-view.tsx by FEAT-014 (ui-design
// D3) so the ACTIVE section — which is now a client island, because reorder
// needs client state — and the COMPLETED section, which stays server-rendered
// inside its <details> disclosure, render identical markup. Two renderers of one
// design.md component is exactly the drift `toSummary` and `TASK_COLUMNS` exist
// to prevent, in the presentation layer.
//
// Nothing about the row's behaviour changed in the move. What is new is the
// optional `handle` slot at the end of the right cluster, which the active
// island fills with the reorder handle and the completed section leaves empty
// (FR-TASK-012 orders ACTIVE tasks only).
//
// The full spec and its history: FEAT-010 (title) → FEAT-011 (due chip,
// priority dot, row-click to SCR-WEB-010) → FEAT-012 (complete-checkbox) →
// FEAT-014 (this handle). All values are design tokens.

/** design.md §4 `task-row`: complete-checkbox + title + right cluster (due-date
 * chip, priority dot, reorder handle). The **full row is the click target for
 * detail** — minus the checkbox's and the handle's own 44px targets — as a link,
 * so middle-click and keyboard both work. Completed rows are struck through and
 * muted. 44px minimum height.
 *
 * **The checkbox is a SIBLING of the link, not a child of it** (FEAT-012 D6):
 * an interactive control inside an anchor is invalid markup and browsers
 * disagree about which target a click or an Enter press activates. The <li> is
 * the flex container; that is the whole reason this row was restructured. The
 * handle is a sibling for the same reason.
 *
 * Completed rows deliberately take **no `--color-surface-sunken` hover tint**
 * (FEAT-012 ui-design D3): `--color-text-muted` measures 4.34:1 on that tint,
 * below the 4.5:1 design.md §5 requires at `body` size. */
export function TaskRow({
  task,
  completed = false,
  handle,
  dragging = false,
  dropTarget = false,
  onDragOver,
  onDrop,
}: {
  task: TaskSummary;
  completed?: boolean;
  /** The reorder controls, rendered last in the right cluster. Active rows
   * only — the completed section passes nothing. */
  handle?: ReactNode;
  /** This row is the one being dragged (`≥lg` pointer path). */
  dragging?: boolean;
  /** The drop would land against this row's leading edge. */
  dropTarget?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <li
      data-testid="task-row"
      data-task-title={task.title}
      data-completed={completed ? "true" : "false"}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-1)",
        paddingLeft: "var(--space-1)",
        borderBottom: "var(--border-width-hairline) solid var(--color-border)",
        // The drop indicator is the `sidebar-nav-item` selected-state accent bar
        // turned horizontal (ui-design): existing token, existing treatment, no
        // new pattern. Transparent otherwise so the row never changes height.
        borderTop: dropTarget
          ? "var(--border-width-thick) solid var(--color-primary)"
          : "var(--border-width-thick) solid transparent",
        // The dragged row takes the same sunken tint hover already uses.
        background: dragging ? "var(--color-surface-sunken)" : "transparent",
      }}
    >
      <TaskCheckbox
        taskId={task.id}
        completed={completed}
        label={
          completed ? `Reopen ${task.title}` : `Mark ${task.title} complete`
        }
      />
      <Link
        href={`/tasks/${task.id}`}
        data-testid="task-row-link"
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          alignItems: "center",
          gap: "var(--space-3)",
          minHeight: "var(--size-touch-target)",
          padding: "var(--space-2) var(--space-3)",
          color: completed ? "var(--color-text-muted)" : "var(--color-text)",
          fontSize: "var(--font-size-body)",
          textDecoration: "none",
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            // The title truncates LAST — it is the row's meaning; the right
            // cluster collapses before it does (ui-design responsive note).
            textDecoration: completed ? "line-through" : "none",
          }}
        >
          {task.title}
        </span>
        {/* Right cluster. Each part renders only when it has something to say:
            no due date means no chip, and priority `none` means no dot — the
            default state is the absence of a mark, not a grey dot everywhere. */}
        {task.dueAt && (
          <DueChip dueAt={task.dueAt} isOverdue={task.isOverdue} />
        )}
        <PriorityDot priority={task.priority} />
      </Link>
      {handle}
    </li>
  );
}
