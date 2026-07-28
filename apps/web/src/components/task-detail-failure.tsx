"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// SCR-WEB-010's `not-found` and `error` states (FEAT-011 ui-design), as
// design.md's `inline-alert` — subtle tinted bg + matching text token.
//
// `not-found` is the UNIFORM answer for an id that is unknown, owned by someone
// else, or soft-deleted: the API returns one 404 for all three and the screen
// must not reveal which (FR-AUTHZ-003, technical-design §3.1).
//
// The two states get DIFFERENT affordances, because they are different problems
// — the split SCR-WEB-008's ListViewFailure established and this mirrors
// (acceptance finding R1): a task that doesn't exist is not going to appear on a
// retry, so that state offers a way out; a task that failed to LOAD probably
// will, so that state offers **Retry**.
export function TaskDetailFailure({ kind }: { kind: "not-found" | "error" }) {
  const router = useRouter();
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
      <p style={{ margin: `0 0 var(--space-3)` }}>
        {notFound ? "That task doesn't exist." : "Couldn't load this task."}
      </p>
      {notFound ? (
        <Link
          href="/"
          data-testid="task-back-home"
          style={{
            color: "var(--color-primary)",
            fontSize: "var(--font-size-small)",
          }}
        >
          Back to your tasks
        </Link>
      ) : (
        // design.md `button-tertiary`: transparent, --color-primary text, no
        // border. router.refresh() re-runs the server component that fetched the
        // task, so a transient failure is recoverable in place rather than by
        // navigating away and back.
        <button
          type="button"
          data-testid="task-retry"
          onClick={() => router.refresh()}
          style={{
            minHeight: "var(--size-touch-target)",
            padding: "0 var(--space-4)",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "transparent",
            color: "var(--color-primary)",
            fontSize: "var(--font-size-body)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
