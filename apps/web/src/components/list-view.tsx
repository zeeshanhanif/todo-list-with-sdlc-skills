import type { ListTasksResponse, TaskSummary } from "@todo/shared";
import { QuickAdd } from "@/components/quick-add";

// SCR-WEB-008 — List View (FEAT-010 ui-design), and SCR-WEB-018 when the account
// is brand new. Server component: header, composer, active section, completed
// section. `task-row` is realized as a DELIBERATE SUBSET — title only. The
// complete-checkbox (FEAT-012), due-date chip and priority dot (FEAT-011) and
// drag handle (FEAT-014) are omitted rather than faked (ui-design D2).
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

          {/* Rendered only when it has rows: nothing can complete a task until
              FEAT-012, so an always-present "Completed" heading would be a
              section no user action can fill (ui-design D3). */}
          {completed.length > 0 && (
            <section style={{ marginTop: "var(--space-8)" }}>
              <h2
                data-testid="completed-heading"
                style={{
                  margin: `0 0 var(--space-2)`,
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Completed
              </h2>
              <ul data-testid="completed-tasks" style={sectionStyle}>
                {completed.map((task) => (
                  <TaskRow key={task.id} task={task} completed />
                ))}
              </ul>
            </section>
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

/** design.md §4 `task-row`, partially realized (ui-design D2): the title, in a
 * 44px-minimum row. Completed rows are struck through and muted, as the
 * component specifies. */
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
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: "var(--size-touch-target)",
        padding: "var(--space-2) var(--space-3)",
        borderBottom: "var(--border-width-hairline) solid var(--color-border)",
        color: completed ? "var(--color-text-muted)" : "var(--color-text)",
        fontSize: "var(--font-size-body)",
        textDecoration: completed ? "line-through" : "none",
      }}
    >
      {task.title}
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
