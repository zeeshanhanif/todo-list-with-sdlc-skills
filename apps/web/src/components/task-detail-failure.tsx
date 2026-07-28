import Link from "next/link";

// SCR-WEB-010's `not-found` and `error` states (FEAT-011 ui-design), as
// design.md's `inline-alert` — subtle tinted bg + matching text token.
//
// `not-found` is the UNIFORM answer for an id that is unknown, owned by someone
// else, or soft-deleted: the API returns one 404 for all three and the screen
// must not reveal which (FR-AUTHZ-003, technical-design §3.1). Same treatment
// and same reasoning as SCR-WEB-008's not-found state (FEAT-010).
export function TaskDetailFailure({ kind }: { kind: "not-found" | "error" }) {
  const notFound = kind === "not-found";
  return (
    <div
      data-testid={notFound ? "task-not-found" : "task-error"}
      role="alert"
      style={{
        padding: "var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: notFound
          ? "var(--color-surface-sunken)"
          : "var(--color-danger-subtle)",
        color: notFound ? "var(--color-text)" : "var(--color-danger-text)",
        fontSize: "var(--font-size-body)",
      }}
    >
      <p style={{ margin: 0 }}>
        {notFound ? "That task doesn't exist." : "Couldn't load this task."}
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          marginTop: "var(--space-2)",
          color: "var(--color-primary)",
          fontSize: "var(--font-size-small)",
        }}
      >
        Back to your tasks
      </Link>
    </div>
  );
}
