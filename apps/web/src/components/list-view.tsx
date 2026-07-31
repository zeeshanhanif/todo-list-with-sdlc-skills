import type { ListTasksResponse } from "@todo/shared";
import { QuickAdd } from "@/components/quick-add";
import { ActiveTasks } from "@/components/active-tasks";
import { TaskRow } from "@/components/task-row";

// SCR-WEB-008 — List View (FEAT-010 ui-design), and SCR-WEB-018 when the account
// is brand new. Server component: header, composer, active section, completed
// section.
//
// `task-row` now reaches design.md's spec in full: FEAT-010 shipped the title,
// FEAT-011 added the due-date chip, the priority dot and the row-click to
// SCR-WEB-010, FEAT-012 added the complete-checkbox, and FEAT-014 adds the
// reorder handle — the last of FEAT-010 ui-design D2's four deferrals, none of
// them ever faked.
//
// The ACTIVE section is a client island (`active-tasks.tsx`) because reorder
// needs client state; everything else here — including the completed <details>
// disclosure — stays server-rendered (FEAT-014 ui-design D3), which is what
// keeps FEAT-012 D5's zero-JS property for the part that does not need it.
// The row itself moved to `task-row.tsx` so both sections render identical
// markup rather than forking.
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
            <ActiveTasks listId={list.id} tasks={active} />
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
