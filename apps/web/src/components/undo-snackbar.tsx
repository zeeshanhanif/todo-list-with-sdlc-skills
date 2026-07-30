"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

// design.md §4's `toast` in its **undo-snackbar** variant — SCR-WEB-008's half
// of FEAT-013 (ui-design). The affordance FR-TASK-014 requires "immediately
// after deletion", and the reason a task delete is recoverable at all from the
// UI's point of view.
//
// **Why this lives in the ROOT LAYOUT** (technical-design D6): in
// `app/layout.tsx`, `{children}` and `{detail}` are SIBLINGS — the task-detail
// panel is not inside the app shell. A host mounted in the shell would be
// invisible to the panel, and state held in the panel dies the moment the panel
// closes, which is exactly when this snackbar has to appear. A client provider
// in the root layout survives soft navigation (`router.back()` included), which
// is the lifetime the undo needs.
//
// **It never steals focus** (ui-design D3): it is announced politely and is
// reachable by Tab. The ~7s timer **pauses while it is hovered or contains
// focus**, so a keyboard user is not racing a countdown to reach Undo — and a
// failed undo stops the timer entirely rather than dismissing on a lie
// (AC-11).
//
// Undo restores by asking the server and re-rendering (D2), never by replaying
// a client copy of the row: the section it returns to, its order, the counts
// and `isOverdue` are all the server's answers.
// All values are design tokens.

/** design.md §4: "a ~7s timeout matching the restore window". The SERVER's
 * window is 30 days (until FEAT-020 purges); this is the UI affordance only. */
const UNDO_WINDOW_MS = 7000;

interface Deleted {
  taskId: string;
  /** Shown in the snackbar line — the client already has it, so undoing costs
   * no extra read. */
  title: string;
}

interface UndoApi {
  /** Announce a deletion that already landed on the server. */
  deleted: (entry: Deleted) => void;
}

const UndoContext = createContext<UndoApi | null>(null);

/** The hook the delete control uses. Throws rather than no-oping when the host
 * is missing: a silently absent snackbar would mean a deleted task with no way
 * back, which is the one failure this feature exists to prevent. */
export function useUndo(): UndoApi {
  const api = useContext(UndoContext);
  if (!api) {
    throw new Error("useUndo must be used inside <UndoHost> (app/layout.tsx)");
  }
  return api;
}

export function UndoHost({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [entry, setEntry] = useState<Deleted | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  // The countdown, kept as "time left" rather than a fixed timeout, so pausing
  // and resuming does not restart the window.
  const remaining = useRef(UNDO_WINDOW_MS);
  const startedAt = useRef(0);
  /** Set when a deletion is announced, spent when the route it triggered has
   * actually changed — see the effect below. */
  const refreshOnArrival = useRef(false);

  const deleted = useCallback((next: Deleted) => {
    remaining.current = UNDO_WINDOW_MS;
    refreshOnArrival.current = true;
    setError(null);
    setPaused(false);
    setPending(false);
    setEntry(next);
  }, []);

  /**
   * **Refresh the list the deletion sent us to — not the surface we left.**
   *
   * The delete control closes the detail by popping history (`router.back()`),
   * which lands on a CACHED list still holding the deleted row. Refreshing has
   * to happen after that arrival: `router.refresh()` clears the client cache
   * for the *current* route, so calling it beside `back()` refreshed the dead
   * `/tasks/{id}` and raced the navigation (measured: the panel survived about
   * one run in four, and the row lingered in the rest).
   *
   * Watching `pathname` is what makes it deterministic — the host outlives both
   * surfaces, so it is the one place that can see the arrival happen.
   */
  useEffect(() => {
    if (!refreshOnArrival.current) return;
    refreshOnArrival.current = false;
    router.refresh();
  }, [pathname, router]);

  useEffect(() => {
    if (!entry || paused) {
      return;
    }
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => setEntry(null), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - startedAt.current),
      );
    };
  }, [entry, paused]);

  async function undo() {
    if (!entry) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${entry.taskId}/restore`, {
        method: "POST",
      });
      if (res.status === 200) {
        setEntry(null);
        // The server components behind this host re-render: the row is back in
        // its original section and the counts return.
        router.refresh();
        return;
      }
      if (res.status === 401) {
        window.location.assign("/signin");
        return;
      }
      // Keep the snackbar AND its action — dismissing here would tell the user
      // their task came back when it did not (AC-11). Stopping the clock is
      // what makes the retry reachable.
      setPaused(true);
      setError(
        res.status === 404
          ? "That task can't be restored."
          : "Couldn't undo that just now. Try again.",
      );
    } catch {
      setPaused(true);
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <UndoContext.Provider value={{ deleted }}>
      {children}
      {entry && (
        <div
          // Announced when it appears, without moving focus (design.md §5's
          // aria-live rule for toasts).
          role="status"
          aria-live="polite"
          data-testid="undo-snackbar"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => !error && setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => !error && setPaused(false)}
          style={{
            position: "fixed",
            zIndex: 60,
            bottom: "var(--space-6)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            maxWidth: "calc(100vw - var(--space-8))",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-surface)",
            border: "var(--border-width-hairline) solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-small)",
          }}
          className="undo-snackbar"
        >
          <span
            data-testid="undo-snackbar-message"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {error ?? `Deleted “${entry.title}”.`}
          </span>
          {/* design.md's `button-tertiary`: transparent, --color-primary text
              (5.47:1 light / 9.15:1 dark on this surface — measured, not
              assumed), inside a 44px target. */}
          <button
            type="button"
            data-testid="undo-snackbar-action"
            disabled={pending}
            onClick={() => void undo()}
            style={{
              flex: "none",
              minHeight: "var(--size-touch-target)",
              padding: "0 var(--space-3)",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              color: "var(--color-primary)",
              fontSize: "var(--font-size-small)",
              fontWeight: "var(--font-weight-medium)" as unknown as number,
              cursor: pending ? "progress" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Undoing…" : "Undo"}
          </button>
        </div>
      )}
    </UndoContext.Provider>
  );
}
