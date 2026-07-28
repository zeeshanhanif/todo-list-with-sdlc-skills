"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TASK_PRIORITIES,
  TASK_TITLE_MAX_LENGTH,
  type ApiError,
  type ListSummary,
  type TaskPriority,
  type TaskSummary,
  type UpdateTaskResponse,
} from "@todo/shared";
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from "@/lib/due-date";
import { DueChip, PRIORITY_LABELS } from "@/components/task-meta";

// SCR-WEB-010 — Task Detail (FEAT-011 ui-design). design.md §4
// `task-detail-panel`: editable title, due-date picker, priority selector.
//
// **Saves per field on commit; there is no Save button** (ui-design D2) — which
// is what technical-design D4's partial PATCH exists for. Each control owns its
// own saving and error state, so a failure on one leaves the others operable,
// and a failed save KEEPS the user's value rather than reverting it (NFR-REL-004).
//
// Deliberately absent, each with a feature that owns it: the complete-checkbox
// and status control (FEAT-012), delete (FEAT-013). And NO `list-picker`: no FR
// authorizes moving a task between lists and the PATCH contract rejects `listId`
// (ui-design D3) — a control the API will not honour is worse than none.
// All values are design tokens.

type Field = "title" | "dueAt" | "priority";

export function TaskDetail({
  task: initial,
  list,
}: {
  task: TaskSummary;
  list: ListSummary;
}) {
  const router = useRouter();
  const [task, setTask] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [saving, setSaving] = useState<Field | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  /** One PATCH carrying ONE field. The absent fields are absent from the body,
   * which is exactly how the server leaves them alone (technical-design D4). */
  async function save(field: Field, body: Record<string, unknown>) {
    setSaving(field);
    setErrors((e) => ({ ...e, [field]: undefined }));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 200) {
        const { task: saved } = (await res.json()) as UpdateTaskResponse;
        setTask(saved);
        setTitle(saved.title);
        // Re-render the server components behind the panel so the list row's
        // chip and dot match what was just stored.
        router.refresh();
        return;
      }
      if (res.status === 401) {
        window.location.assign("/signin");
        return;
      }
      const err = (await res.json()) as ApiError;
      setErrors((e) => ({
        ...e,
        [field]:
          err.fields?.[0]?.message ??
          err.message ??
          "Couldn't save that just now. Try again.",
      }));
    } catch {
      setErrors((e) => ({
        ...e,
        [field]: "Couldn't reach the server. Please try again.",
      }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div data-testid="task-detail">
      {/* Title — design.md's type scale puts the detail title at body-lg. */}
      <label htmlFor="task-title" style={labelStyle}>
        Title
      </label>
      <input
        id="task-title"
        data-testid="detail-title"
        value={title}
        maxLength={TASK_TITLE_MAX_LENGTH}
        disabled={saving === "title"}
        aria-invalid={Boolean(errors.title)}
        onChange={(e) => setTitle(e.target.value)}
        // design.md §4's validation convention is "on blur and on submit"; for a
        // panel with no submit button, blur IS the submit (ui-design D2).
        onBlur={() => {
          if (title !== task.title) void save("title", { title });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setTitle(task.title); // revert, don't save
        }}
        style={{
          width: "100%",
          height: "var(--size-control-md)",
          padding: "0 var(--space-3)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          fontSize: "var(--font-size-body-lg)",
          boxSizing: "border-box",
          border: `var(--border-width-hairline) solid ${
            errors.title ? "var(--color-danger)" : "var(--color-border-strong)"
          }`,
        }}
      />
      <FieldError message={errors.title} testId="detail-title-error" />

      {/* List — READ-ONLY (ui-design D3). FR-TASK-004 names the list as one of
          the five details; nothing gives a task a way to change it. */}
      <div style={{ marginTop: "var(--space-4)" }}>
        <span style={labelStyle}>List</span>
        <p
          data-testid="detail-list"
          style={{
            margin: 0,
            fontSize: "var(--font-size-body)",
            color: "var(--color-text)",
          }}
        >
          {list.name}
        </p>
      </div>

      {/* Due date — design.md `due-date-picker`: clearable, interprets the
          user's timezone (the browser's, per technical-design D1/§8). */}
      <div style={{ marginTop: "var(--space-4)" }}>
        <label htmlFor="task-due" style={labelStyle}>
          Due
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            flexWrap: "wrap",
          }}
        >
          <input
            id="task-due"
            data-testid="detail-due"
            type="datetime-local"
            disabled={saving === "dueAt"}
            value={task.dueAt ? toDateTimeLocalValue(task.dueAt) : ""}
            aria-invalid={Boolean(errors.dueAt)}
            onChange={(e) => {
              const v = e.target.value;
              void save("dueAt", {
                dueAt: v === "" ? null : fromDateTimeLocalValue(v),
              });
            }}
            style={{
              height: "var(--size-control-md)",
              padding: "0 var(--space-3)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-body)",
              border: `var(--border-width-hairline) solid ${
                errors.dueAt ? "var(--color-danger)" : "var(--color-border-strong)"
              }`,
            }}
          />
          {task.dueAt && (
            <>
              <DueChip dueAt={task.dueAt} isOverdue={task.isOverdue} />
              {/* FR-TASK-006's "clear" — the component spec's clearable. */}
              <button
                type="button"
                data-testid="detail-due-clear"
                disabled={saving === "dueAt"}
                onClick={() => void save("dueAt", { dueAt: null })}
                style={tertiaryButtonStyle}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>
      <FieldError message={errors.dueAt} testId="detail-due-error" />

      {/* Priority — design.md `priority-selector`, segmented. Each option shows
          its dot AND its label: §5 requires the detail view to name the priority
          rather than rely on colour. */}
      <div style={{ marginTop: "var(--space-4)" }}>
        <span style={labelStyle} id="priority-label">
          Priority
        </span>
        <div
          role="radiogroup"
          aria-labelledby="priority-label"
          data-testid="detail-priority"
          style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}
        >
          {TASK_PRIORITIES.map((p) => {
            const selected = task.priority === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={selected}
                data-priority={p}
                disabled={saving === "priority"}
                onClick={() => {
                  if (!selected) void save("priority", { priority: p });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  minHeight: "var(--size-touch-target)",
                  padding: `0 var(--space-3)`,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontSize: "var(--font-size-body)",
                  background: selected
                    ? "var(--color-primary-subtle)"
                    : "var(--color-surface)",
                  color: selected ? "var(--color-primary)" : "var(--color-text)",
                  border: `var(--border-width-hairline) solid ${
                    selected ? "var(--color-primary)" : "var(--color-border-strong)"
                  }`,
                }}
              >
                {p !== "none" && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: "var(--space-2)",
                      height: "var(--space-2)",
                      borderRadius: "var(--radius-full)",
                      background: `var(--priority-${p})`,
                    }}
                  />
                )}
                {PRIORITY_LABELS[p as TaskPriority]}
              </button>
            );
          })}
        </div>
      </div>
      <FieldError message={errors.priority} testId="detail-priority-error" />

      {/* Status — read-only here; completing a task is FEAT-012's. */}
      <p
        data-testid="detail-status"
        style={{
          marginTop: "var(--space-5)",
          marginBottom: 0,
          fontSize: "var(--font-size-small)",
          color: "var(--color-text-muted)",
        }}
      >
        {task.completedAt ? "Completed" : "Active"}
      </p>
    </div>
  );
}

function FieldError({
  message,
  testId,
}: {
  message?: string;
  testId: string;
}) {
  if (!message) return null;
  return (
    <p
      data-testid={testId}
      role="alert"
      style={{
        margin: "var(--space-1) 0 0",
        fontSize: "var(--font-size-small)",
        color: "var(--color-danger)",
      }}
    >
      {message}
    </p>
  );
}

const labelStyle = {
  display: "block",
  marginBottom: "var(--space-1)",
  fontSize: "var(--font-size-caption)",
  fontWeight: "var(--font-weight-medium)" as unknown as number,
  color: "var(--color-text)",
} as const;

const tertiaryButtonStyle = {
  height: "var(--size-control-sm)",
  padding: "0 var(--space-3)",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "transparent",
  color: "var(--color-primary)",
  fontSize: "var(--font-size-small)",
  cursor: "pointer",
} as const;
