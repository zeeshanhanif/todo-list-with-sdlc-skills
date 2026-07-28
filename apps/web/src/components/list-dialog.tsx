"use client";

import { useEffect, useRef, useState } from "react";
import {
  LIST_ERROR_CODES,
  LIST_NAME_MAX_LENGTH,
  type ApiError,
  type ListSummary,
} from "@todo/shared";

// SCR-WEB-011 — Create/Edit List (ui-design.md). One dialog carrying three
// UC-008 paths: create, rename, and the delete confirmation. A dialog over the
// current route, never a route of its own (ui-design D4). Focus is trapped and
// restored on close, Esc and scrim-click close (design.md §4/§5).
// All values are design tokens.

export type ListDialogMode =
  | { kind: "create" }
  | { kind: "rename"; list: ListSummary }
  | { kind: "delete"; list: ListSummary };

export function ListDialog({
  mode,
  onClose,
  onDone,
}: {
  mode: ListDialogMode;
  onClose: () => void;
  /** Called after a successful mutation; `message` is a toast line, if any. */
  onDone: (message?: string) => void;
}) {
  const [name, setName] = useState(
    mode.kind === "rename" ? mode.list.name : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Autofocus the field (create/rename) or the confirm button (delete);
    // rename pre-selects so typing replaces (ui-design SCR-WEB-011 default).
    if (mode.kind === "delete") {
      confirmRef.current?.focus();
    } else {
      inputRef.current?.focus();
      if (mode.kind === "rename") inputRef.current?.select();
    }
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      // Focus trap (design.md §5).
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitting(true);
    setFieldError(null);
    setFormError(null);
    try {
      const res =
        mode.kind === "create"
          ? await fetch("/api/lists", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name }),
            })
          : mode.kind === "rename"
            ? await fetch(`/api/lists/${mode.list.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name }),
              })
            : await fetch(`/api/lists/${mode.list.id}`, { method: "DELETE" });

      if (res.ok) {
        // Create and rename need no toast — the sidebar visibly changes. A
        // deletion's evidence is a row that vanished, so it gets one.
        onDone(
          mode.kind === "delete" ? `Deleted “${mode.list.name}”` : undefined,
        );
        return;
      }
      if (res.status === 401) {
        // A 401 in the authenticated zone always means "your session is gone"
        // (FEAT-006 ui-design D4).
        window.location.assign("/signin");
        return;
      }
      const body = (await res.json()) as ApiError;
      if (res.status === 404 && mode.kind === "delete") {
        // Already gone (another device). The user's goal is met — close and let
        // the caller refresh (ui-design SCR-WEB-011 delete-confirm).
        onDone();
        return;
      }
      if (body.code === LIST_ERROR_CODES.listNotDeletable) {
        setFormError(body.message);
      } else if (body.fields?.length) {
        setFieldError(body.fields[0].message);
      } else {
        setFormError(body.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isDelete = mode.kind === "delete";
  const title =
    mode.kind === "create"
      ? "New list"
      : mode.kind === "rename"
        ? "Rename list"
        : `Delete “${mode.list.name}”?`;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
        background: "var(--color-overlay)",
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-dialog-title"
        data-testid="list-dialog"
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--color-surface)",
          border: "var(--border-width-hairline) solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          padding: "var(--space-6)",
          boxSizing: "border-box",
        }}
      >
        <h3
          id="list-dialog-title"
          style={{
            margin: 0,
            fontSize: "var(--font-size-h3)",
            color: "var(--color-text)",
          }}
        >
          {title}
        </h3>

        {formError && (
          <div
            role="alert"
            data-testid="dialog-error"
            style={{
              marginTop: "var(--space-4)",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              fontSize: "var(--font-size-small)",
            }}
          >
            {formError}
          </div>
        )}

        {isDelete ? (
          <p
            data-testid="delete-warning"
            style={{
              marginTop: "var(--space-4)",
              marginBottom: 0,
              color: "var(--color-text-muted)",
              fontSize: "var(--font-size-body)",
            }}
          >
            {mode.list.taskCount > 0
              ? `This will permanently delete “${mode.list.name}” and its ${mode.list.taskCount} ${
                  mode.list.taskCount === 1 ? "task" : "tasks"
                }. This can’t be undone.`
              : `This will permanently delete “${mode.list.name}”. This can’t be undone.`}
          </p>
        ) : (
          <form onSubmit={submit} noValidate>
            <div style={{ marginTop: "var(--space-4)" }}>
              <label
                htmlFor="list-name"
                style={{
                  display: "block",
                  marginBottom: "var(--space-1)",
                  fontSize: "var(--font-size-caption)",
                  color: "var(--color-text)",
                }}
              >
                Name
              </label>
              <input
                id="list-name"
                ref={inputRef}
                data-testid="list-name-input"
                type="text"
                value={name}
                maxLength={LIST_NAME_MAX_LENGTH}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(fieldError)}
                style={{
                  width: "100%",
                  height: "var(--size-control-md)",
                  padding: "0 var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: "var(--font-size-body)",
                  boxSizing: "border-box",
                  border: `var(--border-width-hairline) solid ${
                    fieldError
                      ? "var(--color-danger)"
                      : "var(--color-border-strong)"
                  }`,
                }}
              />
              {fieldError && (
                <p
                  data-testid="list-name-error"
                  style={{
                    margin: "var(--space-1) 0 0",
                    fontSize: "var(--font-size-small)",
                    color: "var(--color-danger)",
                  }}
                >
                  {fieldError}
                </p>
              )}
            </div>
          </form>
        )}

        <div className="form-actions" style={{ marginTop: "var(--space-6)" }}>
          {isDelete ? (
            <>
              <button
                type="button"
                ref={confirmRef}
                data-testid="dialog-confirm"
                disabled={submitting}
                onClick={() => void submit()}
                style={{
                  ...actionButton,
                  flex: 1,
                  background: "var(--color-danger)",
                  color: "var(--color-on-primary)",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Deleting…" : "Delete list"}
              </button>
              <button
                type="button"
                data-testid="dialog-cancel"
                onClick={onClose}
                style={{
                  ...actionButton,
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  border:
                    "var(--border-width-hairline) solid var(--color-border-strong)",
                  padding: "0 var(--space-5)",
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-testid="dialog-confirm"
                disabled={submitting}
                onClick={() => void submit()}
                style={{
                  ...actionButton,
                  flex: 1,
                  background: "var(--color-primary)",
                  color: "var(--color-on-primary)",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting
                  ? "Saving…"
                  : mode.kind === "create"
                    ? "Create list"
                    : "Save"}
              </button>
              <button
                type="button"
                data-testid="dialog-cancel"
                onClick={onClose}
                style={{
                  ...actionButton,
                  background: "transparent",
                  color: "var(--color-primary)",
                  padding: "0 var(--space-5)",
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const actionButton = {
  height: "var(--size-control-lg)",
  borderRadius: "var(--radius-md)",
  border: "none",
  fontSize: "var(--font-size-body)",
  fontWeight: "var(--font-weight-medium)" as unknown as number,
  cursor: "pointer",
};
