import Link from "next/link";
import type { ListTasksResponse, TaskSummary } from "@todo/shared";
import { QuickAdd } from "@/components/quick-add";
import { DueChip, PriorityDot } from "@/components/task-meta";
import { TaskCheckbox } from "@/components/task-checkbox";

// SCR-WEB-008 — List View (FEAT-010 ui-design), and SCR-WEB-018 when the account
// is brand new. Server component: header, composer, active section, completed
// section.
//
// `task-row` reaches design.md's spec here except for one part: FEAT-010 shipped
// the title, FEAT-011 added the due-date chip, the priority dot and the row-click
// to SCR-WEB-010, and FEAT-012 adds the complete-checkbox. Only the drag handle
// (FEAT-014) is still omitted rather than faked — the rule FEAT-010 ui-design D2
// set, now down to its last deferral.
// All values are design tokens.

export function ListView({
  data,
  firstRun,
}: {
  data: ListTasksResponse;
  /** The account has exactly one (default) list and it is empty — render
   * SCR-WEB-018's onboarding copy instead of the generic empty state
   * (ui-design D1). */
  firstRun: boolean;
}) {
  const { list, active, completed } = data;
  const isEmpty = active.length === 0 && completed.length === 0;

  return (
    <>
      <header style={{ marginBottom: "var(--space-5)" }}>
        <h1
          data-testid="list-title"
          title={list.name}
          style={{
            margin: 0,
            fontSize: "var(--font-size-h1)",
            lineHeight: "var(--font-line-height-h1)",
            color: "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {list.name}
        </h1>
        {list.activeTaskCount > 0 && (
          <p
            data-testid="list-subtitle"
            style={{
              margin: "var(--space-1) 0 0",
              fontSize: "var(--font-size-small)",
              color: "var(--color-text-muted)",
            }}
          >
            {list.activeTaskCount} {list.activeTaskCount === 1 ? "task" : "tasks"}{" "}
            left
          </p>
        )}
      </header>

      <QuickAdd listId={list.id} />

      {isEmpty ? (
        <EmptyState firstRun={firstRun} />
      ) : (
        <>
          {active.length > 0 && (
            <ul data-testid="active-tasks" style={sectionStyle}>
              {active.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}

          {/* FR-TASK-011 — collapsed by default, expandable to review and
              reopen. A native <details> (FEAT-012 D5): keyboard operability and
              the expanded/collapsed state announced to assistive technology come
              free, with zero client JavaScript in a server component. Still
              rendered only when it has rows — an empty "Completed" section is
              noise (FEAT-010 ui-design D3), it is just no longer unfillable. */}
          {completed.length > 0 && (
            <details data-testid="completed-section" style={{ marginTop: "var(--space-8)" }}>
              <summary
                data-testid="completed-heading"
                style={{
                  // `list-item` (the element's own default) rather than flex:
                  // flex suppresses the native ::marker, and the disclosure
                  // triangle — which rotates on open for free — is the only
                  // sign a collapsed section can be opened.
                  display: "list-item",
                  listStylePosition: "inside",
                  minHeight: "var(--size-touch-target)",
                  lineHeight: "var(--size-touch-target)",
                  cursor: "pointer",
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {/* The count is not decoration: collapsed, it is the only sign
                    there is anything inside (ui-design). */}
                Completed ({completed.length})
              </summary>
              <ul data-testid="completed-tasks" style={sectionStyle}>
                {completed.map((task) => (
                  <TaskRow key={task.id} task={task} completed />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </>
  );
}

const sectionStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
};

/** design.md §4 `task-row`: complete-checkbox + title + right cluster (due-date
 * chip, priority dot). The **full row is the click target for detail** — minus
 * the checkbox's own 44px target — as a link, so middle-click and keyboard both
 * work. Completed rows are struck through and muted. 44px minimum height.
 *
 * **The checkbox is a SIBLING of the link, not a child of it** (FEAT-012 D6):
 * an interactive control inside an anchor is invalid markup and browsers
 * disagree about which target a click or an Enter press activates. The <li> is
 * the flex container; that is the whole reason this row was restructured.
 *
 * Completed rows deliberately take **no `--color-surface-sunken` hover tint**
 * (FEAT-012 ui-design D3): `--color-text-muted` measures 4.34:1 on that tint,
 * below the 4.5:1 design.md §5 requires at `body` size. */
function TaskRow({
  task,
  completed = false,
}: {
  task: TaskSummary;
  completed?: boolean;
}) {
  return (
    <li
      data-testid="task-row"
      data-task-title={task.title}
      data-completed={completed ? "true" : "false"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-1)",
        paddingLeft: "var(--space-1)",
        borderBottom: "var(--border-width-hairline) solid var(--color-border)",
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
    </li>
  );
}

/** design.md §4's empty convention — icon slot + h3 + one-line subtext + a
 * primary action. The action is the composer above, already focused
 * (ui-design D4), so this block is copy only. Copy per §6's voice. */
function EmptyState({ firstRun }: { firstRun: boolean }) {
  return (
    <div
      data-testid={firstRun ? "first-run-empty" : "list-empty"}
      style={{
        padding: "var(--space-10) var(--space-4)",
        textAlign: "center",
        color: "var(--color-text-muted)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          fontSize: "var(--font-size-h1)",
          color: "var(--color-text-subtle)",
          marginBottom: "var(--space-2)",
        }}
      >
        ☐
      </div>
      <h3
        style={{
          margin: `0 0 var(--space-1)`,
          fontSize: "var(--font-size-h3)",
          color: "var(--color-text)",
        }}
      >
        {firstRun ? "Welcome — let's get you started" : "Nothing here yet"}
      </h3>
      <p style={{ margin: 0, fontSize: "var(--font-size-body)" }}>
        {firstRun
          ? "Add your first task above. Everything lands in Inbox unless you pick another list."
          : "Add your first task and get rolling."}
      </p>
    </div>
  );
}
