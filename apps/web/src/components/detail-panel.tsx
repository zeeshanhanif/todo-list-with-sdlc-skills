"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// The shell's DETAIL HOST as design.md §3 specifies it (SCR-WEB-007, FEAT-011's
// extension): a right slide-in of `--size-detail-panel-width` at ≥lg, an overlay
// at md, full-screen below md. Rendered only when a task is open — when the slot
// is empty nothing is mounted, so there is no empty gutter.
//
// Keyboard, per design.md §5: **Esc closes, focus is trapped while open, and
// restored on close.** All three are implemented below rather than assumed —
// the element declares `aria-modal="true"`, which tells assistive technology the
// rest of the page is inert, and that claim has to be true (acceptance finding
// R2; an earlier version trapped nothing and left restoration to router.back(),
// which browsers do not guarantee).
// All values are design tokens.
export function DetailPanel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = panel.current;
    // Whatever had focus when the panel opened — the task-row link, in the
    // normal path. Captured now so it can be restored on unmount.
    const opener = document.activeElement as HTMLElement | null;

    /** Tabbable descendants, in DOM order. Recomputed per keypress because the
     * panel's contents change as fields save and errors appear. */
    const tabbables = (): HTMLElement[] =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        router.back();
        return;
      }
      if (e.key !== "Tab") return;

      // The trap: Tab past the last control wraps to the first, Shift+Tab
      // before the first wraps to the last, so focus cannot walk out into the
      // list behind the scrim while the panel claims to be modal.
      const items = tabbables();
      if (items.length === 0) {
        e.preventDefault();
        node?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (!e.shiftKey && (active === last || !node?.contains(active))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || !node?.contains(active))) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    // Move focus into the panel so a keyboard user lands where the content is,
    // and so Esc reaches the handler without a stray click first.
    node?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to the element that opened the panel (design.md §5). Only
      // if it is still in the document — the row can be gone if the underlying
      // list re-rendered while the panel was open.
      if (opener && document.contains(opener)) {
        opener.focus();
      }
    };
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
