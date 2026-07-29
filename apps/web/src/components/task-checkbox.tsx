"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// design.md §4's `checkbox` — the task-complete control (FEAT-012 ui-design),
// rendered on SCR-WEB-008's rows and SCR-WEB-010's detail. **One component,
// three call sites** (ui-design D2): the active row, the completed row inside
// the disclosure, and the detail panel differ only in their label.
//
// A REAL <input type="checkbox">, restyled — not a div with role="checkbox".
// That is what makes Space toggle it (design.md §5 states that rule verbatim)
// and what announces the checked state without any ARIA of our own. The check
// itself is a text glyph over the box, aria-hidden: the input carries the
// meaning, the glyph only shows it, which is also how this survives the
// project's carried no-icon-library deviation.
//
// **Optimistic, with rollback** (ui-design D1): the box moves immediately and
// snaps back if the write fails, because AC-12 forbids a control that reads
// completed while the task is still active. Only the BOX is optimistic — the row
// does not change section until the server confirms and `router.refresh()`
// re-renders, so a failure never yanks a row across a section boundary.
//
// Two colours here are load-bearing rather than stylistic, both settled by the
// 2026-07-29 design-system amendment: the unchecked ring is `--color-text-muted`
// (4.76:1) because `--color-border-strong` is 1.48:1 — below the 3:1 §5 requires
// for the one mark that identifies the control — and the glyph is
// `--color-on-primary`, which re-values per theme, because literal white on the
// dark theme's `--color-success` is 1.92:1.
// All values are design tokens.

export function TaskCheckbox({
  taskId,
  completed,
  label,
  variant = "row",
}: {
  taskId: string;
  completed: boolean;
  /** What this control does to THIS task. The task's title on a row (where it
   * is the accessible name only); the visible "Mark complete" / "Completed …"
   * text in the detail panel. */
  label: string;
  /** `row` is the bare box in a list row; `detail` pairs it with a visible
   * label. Not a design.md variant — the same control with its label shown. */
  variant?: "row" | "detail";
}) {
  const router = useRouter();
  // Optimistic local truth. `completed` is the server's; while a write is in
  // flight the two differ, and after `router.refresh()` they agree again.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isChecked = optimistic ?? completed;

  async function toggle(next: boolean) {
    setOptimistic(next);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tasks/${taskId}/${next ? "complete" : "reopen"}`,
        { method: "POST" },
      );
      if (res.status === 200) {
        // The server components behind this island re-render: the row changes
        // section, the header subtitle and the sidebar counts move. Client state
        // survives a refresh, so the box does not flicker on the way.
        router.refresh();
        return;
      }
      if (res.status === 401) {
        window.location.assign("/signin");
        return;
      }
      // Roll back — what is stored is what the box must show.
      setOptimistic(null);
      setError(
        res.status === 404
          ? "That task no longer exists."
          : "Couldn't save that just now. Try again.",
      );
    } catch {
      setOptimistic(null);
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // The box, inside its 44px target (design.md §4/§5) — the target is the
  // padding around a 20px control, not a 44px circle.
  const control = (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "var(--size-touch-target)",
        minHeight: "var(--size-touch-target)",
        flex: "none",
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        disabled={pending}
        aria-label={variant === "row" ? label : undefined}
        data-testid="task-checkbox"
        data-completed={isChecked ? "true" : "false"}
        onChange={(e) => void toggle(e.currentTarget.checked)}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          width: "var(--space-5)",
          height: "var(--space-5)",
          margin: 0,
          borderRadius: "var(--radius-full)",
          cursor: pending ? "progress" : "pointer",
          // §2's control-boundary rule: the ring IS the control when unchecked.
          border: `var(--border-width-thick) solid ${
            isChecked ? "var(--color-success)" : "var(--color-text-muted)"
          }`,
          background: isChecked ? "var(--color-success)" : "transparent",
          transition: "background var(--duration-fast) var(--easing-standard)",
          opacity: pending ? 0.6 : 1,
        }}
      />
      {isChecked && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            pointerEvents: "none",
            color: "var(--color-on-primary)",
            fontSize: "var(--font-size-caption)",
            lineHeight: 1,
            opacity: pending ? 0.6 : 1,
          }}
        >
          ✓
        </span>
      )}
    </span>
  );

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
      }}
    >
      {variant === "detail" ? (
        // One <label> wrapping box and text, so the words are part of the
        // target — design.md §5's "labels associated with inputs".
        <label
          data-testid="detail-status-control"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            cursor: pending ? "progress" : "pointer",
            fontSize: "var(--font-size-body)",
            color: "var(--color-text)",
          }}
        >
          {control}
          {label}
        </label>
      ) : (
        control
      )}
      {/* The failure lives beside the control that failed, and is announced
          when it appears — never a toast (ui-design D1). */}
      {error && (
        <span
          role="alert"
          data-testid="task-checkbox-error"
          style={{
            fontSize: "var(--font-size-small)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
