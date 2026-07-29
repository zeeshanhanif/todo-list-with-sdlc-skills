"use client";

import { TASK_PRIORITIES, type TaskPriority } from "@todo/shared";
import { formatDueDate } from "@/lib/due-date";

// The two design.md indicators FEAT-011 adds, in one place because SCR-WEB-008's
// task-row and SCR-WEB-010's detail both render them (ui-design D4).
// All values are design tokens.

/** design.md §4 `badge`/`chip` — `caption`, `--radius-full`, tinted bg + its
 * MATCHING text token. When overdue it carries the word "Overdue" as well as the
 * danger colour: design.md §5 forbids conveying meaning by colour alone, and §8
 * names this case explicitly.
 *
 * `--color-danger-text` is the partner the design system gained in the amendment
 * this feature filed — `--color-danger` on `--color-danger-subtle` is 3.95:1,
 * under the 4.5:1 §5 requires at this size. */
export function DueChip({
  dueAt,
  isOverdue,
}: {
  dueAt: string;
  isOverdue: boolean;
}) {
  return (
    <span
      data-testid="due-chip"
      data-overdue={isOverdue ? "true" : "false"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: `0 var(--space-2)`,
        minHeight: "var(--size-control-sm)",
        borderRadius: "var(--radius-full)",
        fontSize: "var(--font-size-caption)",
        lineHeight: "var(--font-line-height-caption)",
        whiteSpace: "nowrap",
        background: isOverdue
          ? "var(--color-danger-subtle)"
          : "var(--color-surface-sunken)",
        // Both pairings are the design system's own tint rules (design.md §2),
        // and both were measured rather than eyeballed. The ordinary variant is
        // `--color-text` because muted on the sunken tint is 4.34:1 — under the
        // 4.5:1 §5 requires at this size, which was DEF-004.
        color: isOverdue
          ? "var(--color-danger-text)"
          : "var(--color-text)",
      }}
    >
      {isOverdue && <strong>Overdue</strong>}
      {formatDueDate(dueAt)}
    </span>
  );
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function priorityLabel(p: TaskPriority): string {
  return PRIORITY_LABELS[p];
}

/** design.md §4 `task-row`'s priority dot — `--radius-full`, `--priority-*`
 * (the real token names; design.md's `--color-priority-*` resolved to nothing
 * and was corrected by this feature's amendment).
 *
 * **Not rendered for `none`**: the default state is the absence of a mark, not a
 * grey dot on every row. Carries an `aria-label`, because a colour is not a
 * label (design.md §5). */
export function PriorityDot({ priority }: { priority: TaskPriority }) {
  if (priority === "none") return null;
  return (
    <span
      data-testid="priority-dot"
      data-priority={priority}
      role="img"
      aria-label={`${PRIORITY_LABELS[priority]} priority`}
      title={`${PRIORITY_LABELS[priority]} priority`}
      style={{
        flex: "none",
        width: "var(--space-2)",
        height: "var(--space-2)",
        borderRadius: "var(--radius-full)",
        background: `var(--priority-${priority})`,
      }}
    />
  );
}

export { TASK_PRIORITIES, PRIORITY_LABELS };
