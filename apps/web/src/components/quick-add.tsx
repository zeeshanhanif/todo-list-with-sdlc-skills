"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TASK_TITLE_MAX_LENGTH, type ApiError } from "@todo/shared";

// design.md §4 `quick-add` — the persistent single-line composer at the top of
// SCR-WEB-008 (FEAT-010 ui-design). **Title-only in this slice**: the due-date
// and priority affordances the component also specifies arrive with FEAT-011
// (technical-design D6). Enter creates (design.md §5). Autofocused, so the
// empty state's primary action is the composer itself (ui-design D4) and the
// first task is one field + one action away (NFR-USE-001).
// All values are design tokens.
export function QuickAdd({ listId }: { listId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
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
        body: JSON.stringify({ title }),
      });
      if (res.status === 201) {
        setTitle("");
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
