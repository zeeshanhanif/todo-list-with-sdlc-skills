"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUndo } from "@/components/undo-snackbar";

// SCR-WEB-010's delete affordance (FEAT-013 ui-design): design.md §4's
// `button-danger` — "Delete task" — plus the `confirm-dialog` it opens.
//
// **Confirmed AND undoable.** NFR-USE-002 names "delete task" among the
// destructive actions that require explicit confirmation, and the product
// owner read it literally (technical-design D2): the first click asks, the
// confirm deletes, and the undo snackbar catches the mistake the dialog did
// not. ux-foundations Flow 3 still draws the snackbar-only version and owes an
// amendment — build what D2 says.
//
// **Nothing is written on any path but confirm** (AC-9b): cancel, Esc and
// scrim-click send no request at all.
//
// A second local dialog rather than a refactor of `list-dialog.tsx`
// (ui-design D1): that file is SCR-WEB-011's screen, and extracting a shared
// component out of it in service of this feature is the drive-by refactor
// feature scope forbids. The behaviour is copied — initial focus on confirm,
// trap, Esc, scrim, submitting state — the file is not.
// All values are design tokens.

export function TaskDelete({
  taskId,
  title,
  listId,
  presentation,
}: {
  taskId: string;
  title: string;
  /** Where the full-page presentation goes after a delete — the task's own
   * list, since the task it was showing no longer exists. */
  listId: string;
  /** `panel` pops the interception with history; `page` navigates to the list.
   * One component serves both presentations (FEAT-011 D1), so the difference
   * has to be a prop rather than two components — and it is load-bearing, not
   * cosmetic: only history can close an intercepted route. */
  presentation: "panel" | "page";
}) {
  const router = useRouter();
  const undo = useUndo();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirming) return;
    // The destructive button takes focus, matching list-dialog's delete branch.
    confirmRef.current?.focus();
  }, [confirming]);

  /**
   * Esc and Tab, handled **on the card** rather than on `document` — and
   * `stopPropagation` is the whole point.
   *
   * `DetailPanel` keeps its own document-level Esc listener (it is a modal
   * too), so a dialog that listened on `document` closed BOTH: the confirm
   * dismissed and the panel behind it navigated away with it. Caught by the
   * E2E. Handling the key where it happens — focus is trapped inside this card
   * — lets the topmost layer consume it, which is what a stack of modals is
   * supposed to do.
   *
   * **`nativeEvent.stopImmediatePropagation()`, not just the synthetic one.**
   * React attaches its listeners at the app ROOT CONTAINER, not at `document`,
   * so stopping a synthetic event stops React's own propagation while the
   * native event keeps bubbling up to `document` — where the panel is
   * listening. Also caught by the E2E, on the second attempt, and worth the
   * comment: the first fix looked right and changed nothing.
   */
  function onCardKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !cardRef.current) return;
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    // Focus trap (design.md §5) — while a modal claims the rest of the page
    // is inert, that claim has to be true.
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
  }

  /** Close WITHOUT deleting — and hand focus back to the control that opened
   * the dialog (design.md §5). */
  function close() {
    setConfirming(false);
    setError(null);
    openerRef.current?.focus();
  }

  async function confirmDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (res.status === 200) {
        // Tell the host BEFORE leaving: this surface is about to unmount, and
        // the snackbar lives above both it and the list (technical-design D6).
        undo.deleted({ taskId, title });
        // **`back()` closes the panel; nothing else can.** An intercepted route
        // is popped by history, not by navigating elsewhere: parallel-route
        // slots keep their active subpage across a soft navigation, so a
        // `push`/`replace` to the list leaves the panel mounted over it
        // (measured — `default.tsx` only wins on a hard navigation). This is
        // the same mechanism the panel's own close button and Esc use.
        //
        // **And no `refresh()` beside it**: the docs are explicit that refresh
        // clears the client cache for the CURRENT route, which here is the dead
        // /tasks/{id}, and firing it into a pending `back()` raced — the panel
        // survived roughly one run in four. The list is `force-dynamic`, so the
        // navigation itself brings the fresh list; the host re-renders it once
        // more when the undo lands.
        if (presentation === "panel") {
          router.back();
        } else {
          router.replace(`/lists/${listId}`);
        }
        return;
      }
      if (res.status === 401) {
        window.location.assign("/signin");
        return;
      }
      // The dialog stays open with the task still in the list behind it. The
      // one thing this must never do is close as though it worked (AC-11).
      setSubmitting(false);
      setError(
        res.status === 404
          ? "That task no longer exists."
          : "Couldn't delete that just now. Try again.",
      );
    } catch {
      setSubmitting(false);
      setError("Couldn't reach the server. Please try again.");
    }
  }

  return (
    <div
      style={{
        marginTop: "var(--space-6)",
        paddingTop: "var(--space-4)",
        borderTop: "var(--border-width-hairline) solid var(--color-border)",
      }}
    >
      <button
        type="button"
        ref={openerRef}
        data-testid="task-delete"
        onClick={() => setConfirming(true)}
        style={{
          minHeight: "var(--size-touch-target)",
          padding: "0 var(--space-4)",
          borderRadius: "var(--radius-md)",
          border: "none",
          // design.md §4's `button-danger`. The ink is --color-on-primary, not
          // literal white: white on the DARK theme's --color-danger (#F87171)
          // measures 2.77:1, below §5's 4.5:1 — the same finding FEAT-012 filed
          // for the checkbox glyph, filed again here for the prose that still
          // says "white text".
          background: "var(--color-danger)",
          color: "var(--color-on-primary)",
          fontSize: "var(--font-size-body)",
          cursor: "pointer",
        }}
      >
        Delete task
      </button>

      {confirming && (
        <>
          <div
            aria-hidden="true"
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
              background: "var(--color-overlay)",
            }}
          />
          <div
            ref={cardRef}
            onKeyDown={onCardKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-task-title"
            data-testid="task-delete-dialog"
            style={{
              position: "fixed",
              zIndex: 41,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(calc(100vw - var(--space-8)), 26rem)",
              padding: "var(--space-5)",
              background: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <h3
              id="delete-task-title"
              style={{
                margin: 0,
                fontSize: "var(--font-size-h3)",
                color: "var(--color-text)",
              }}
            >
              Delete this task?
            </h3>
            {/* design.md §6: plain and reassuring here, never joking — and
                honest about the window rather than claiming permanence the
                system does not have. */}
            <p
              style={{
                margin: "var(--space-3) 0 0",
                fontSize: "var(--font-size-body)",
                color: "var(--color-text)",
              }}
            >
              “{title}” will be removed. You&rsquo;ll be able to undo this for a
              few seconds.
            </p>

            {error && (
              <div
                role="alert"
                data-testid="task-delete-error"
                style={{
                  marginTop: "var(--space-4)",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-danger-subtle)",
                  // The AA partner for the tint (DEF-003) — NOT --color-danger,
                  // which measures 3.95:1 here.
                  color: "var(--color-danger-text)",
                  fontSize: "var(--font-size-small)",
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                marginTop: "var(--space-5)",
              }}
            >
              <button
                type="button"
                ref={confirmRef}
                data-testid="task-delete-confirm"
                disabled={submitting}
                onClick={() => void confirmDelete()}
                style={{
                  ...dialogButton,
                  flex: 1,
                  background: "var(--color-danger)",
                  color: "var(--color-on-primary)",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                data-testid="task-delete-cancel"
                disabled={submitting}
                onClick={close}
                style={{
                  ...dialogButton,
                  flex: 1,
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  border:
                    "var(--border-width-hairline) solid var(--color-text-muted)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const dialogButton = {
  minHeight: "var(--size-touch-target)",
  padding: "0 var(--space-4)",
  borderRadius: "var(--radius-md)",
  border: "none",
  fontSize: "var(--font-size-body)",
  cursor: "pointer",
} as const;
