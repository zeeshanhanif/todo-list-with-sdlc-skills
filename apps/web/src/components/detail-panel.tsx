"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// The shell's DETAIL HOST as design.md §3 specifies it (SCR-WEB-007, FEAT-011's
// extension): a right slide-in of `--size-detail-panel-width` at ≥lg, an overlay
// at md, full-screen below md. Rendered only when a task is open — when the slot
// is empty nothing is mounted, so there is no empty gutter.
//
// Keyboard, per design.md §5: **Esc closes** and focus is restored to the
// task-row that opened it (the browser does the restoring, because closing is a
// router.back() to the page that owns that row).
// All values are design tokens.
export function DetailPanel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the panel so a keyboard user lands where the content is,
    // and so Esc reaches the handler without a stray click first.
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      {/* Scrim: design.md's `--color-overlay`. Below lg the panel is full-screen,
          so the scrim only reads as a scrim on wide viewports — it is harmless
          beneath a full-bleed panel either way. */}
      <div
        aria-hidden="true"
        onClick={() => router.back()}
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--color-overlay)",
          zIndex: 20,
        }}
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Task detail"
        data-testid="detail-panel"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(100vw, var(--size-detail-panel-width))",
          zIndex: 21,
          overflowY: "auto",
          padding: "var(--space-5)",
          background: "var(--color-surface)",
          boxShadow: "var(--shadow-md)",
          borderTopLeftRadius: "var(--radius-lg)",
          borderBottomLeftRadius: "var(--radius-lg)",
          outline: "none",
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close task"
          data-testid="detail-close"
          style={{
            minWidth: "var(--size-touch-target)",
            minHeight: "var(--size-touch-target)",
            marginBottom: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "transparent",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-body-lg)",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
        {children}
      </div>
    </>
  );
}
