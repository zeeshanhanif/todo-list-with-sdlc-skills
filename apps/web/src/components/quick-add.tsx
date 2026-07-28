"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TASK_PRIORITIES,
  TASK_TITLE_MAX_LENGTH,
  type ApiError,
  type TaskPriority,
} from "@todo/shared";
import { fromDateTimeLocalValue } from "@/lib/due-date";
import { PRIORITY_LABELS } from "@/components/task-meta";

// design.md §4 `quick-add` — the persistent single-line composer at the top of
// SCR-WEB-008. FEAT-011 completes it: the component's specified "inline
// affordances to set due date and priority" are here now (FEAT-010 D6 deferred
// them to this feature, since FR-TASK-006/008 belong to it).
//
// **Enter still creates on a title alone** — neither affordance is required to
// submit, so NFR-USE-001's one-field, one-action path is unchanged. Autofocused,
// so the empty state's primary action is the composer itself (ui-design D4).
// All values are design tokens.
export function QuickAdd({ listId }: { listId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Send each optional field only when it was actually set, so a plain
        // title-only create is byte-identical to what FEAT-010 sent (D8).
        body: JSON.stringify({
          title,
          ...(dueAt ? { dueAt: fromDateTimeLocalValue(dueAt) } : {}),
          ...(priority !== "none" ? { priority } : {}),
        }),
      });
      if (res.status === 201) {
        setTitle("");
        // Both affordances reset after a successful create — the next task
        // starts from a clean composer rather than inheriting a stale date.
        setDueAt("");
        setPriority("none");
        // Re-render the server component that fetched the view, so the new task
        // appears last in the active section without a manual reload (AC-11).
        router.refresh();
        return;
      }
      if (res.status === 401) {
        window.location.assign("/signin");
        return;
      }
      const body = (await res.json()) as ApiError;
      // The typed title is deliberately kept on failure (NFR-REL-004).
      setError(
        body.fields?.[0]?.message ??
          body.message ??
          "Couldn't add that just now. Try again.",
      );
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate style={{ marginBottom: "var(--space-6)" }}>
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <input
          data-testid="quick-add-input"
          type="text"
          value={title}
          autoFocus
          maxLength={TASK_TITLE_MAX_LENGTH}
          placeholder="Add a task…"
          aria-label="Add a task"
          aria-invalid={Boolean(error)}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            height: "var(--size-control-md)",
            padding: "0 var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-body)",
            boxSizing: "border-box",
            border: `var(--border-width-hairline) solid ${
              error ? "var(--color-danger)" : "var(--color-border-strong)"
            }`,
          }}
        />
        <button
          type="submit"
          data-testid="quick-add-submit"
          disabled={submitting}
          style={{
            height: "var(--size-control-md)",
            padding: "0 var(--space-5)",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-medium)" as unknown as number,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {submitting ? "Adding…" : "Add task"}
        </button>
      </div>

      {/* The inline affordances design.md's `quick-add` specifies. They use the
          same values and the same wire format the detail panel does — one
          due-date control and one priority control across the product
          (ui-design D4). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          marginTop: "var(--space-2)",
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: "var(--font-size-small)",
            color: "var(--color-text-muted)",
          }}
        >
          Due
          <input
            data-testid="quick-add-due"
            type="datetime-local"
            value={dueAt}
            aria-label="Due date"
            onChange={(e) => setDueAt(e.target.value)}
            style={{
              height: "var(--size-control-sm)",
              padding: "0 var(--space-2)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-small)",
              border:
                "var(--border-width-hairline) solid var(--color-border-strong)",
            }}
          />
        </label>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            fontSize: "var(--font-size-small)",
            color: "var(--color-text-muted)",
          }}
        >
          Priority
          <select
            data-testid="quick-add-priority"
            value={priority}
            aria-label="Priority"
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            style={{
              height: "var(--size-control-sm)",
              padding: "0 var(--space-2)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-small)",
              border:
                "var(--border-width-hairline) solid var(--color-border-strong)",
            }}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p
          data-testid="quick-add-error"
          style={{
            margin: "var(--space-1) 0 0",
            fontSize: "var(--font-size-small)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
