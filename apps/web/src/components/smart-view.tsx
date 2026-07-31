"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SearchResult, SmartView, SmartViewResponse } from "@todo/shared";
import { loadMoreView } from "@/lib/views-client";
import { DueChip, PriorityDot } from "@/components/task-meta";
import { TaskCheckbox } from "@/components/task-checkbox";

// SCR-WEB-009 — Smart View (FEAT-016 ui-design). A ROUTE, not an overlay
// (ui-design D5): four URLs, one component. The first page arrives from the
// server component that renders this one, so the common path paints with its
// tasks; only "Load more" talks to the BFF.
//
// A client component for exactly that reason — and because the row's checkbox
// and the appended pages are the only interactive parts of the screen.
//
// The row is the FULL design.md §4 `task-row` including the complete-checkbox,
// which is the opposite of SCR-WEB-012's read-only subset and for the opposite
// reason (ui-design D2): the write exists here. Completing a task removes it
// from an active-only view on the next refresh — correct, and the reason the
// disappearance is not a bug.
// All values are design tokens.

/** Heading, empty headline and empty subtext per view — design.md §4 asks for
 * "distinct copy per context" and names the smart view as its own (D3). An
 * empty Overdue deliberately carries NO action: answering "you have nothing
 * late" with "Add a task" reads as the product failing to notice. */
const VIEW_COPY: Record<
  SmartView,
  { title: string; emptyTitle: string; emptyBody: string; action: boolean }
> = {
  today: {
    title: "Today",
    emptyTitle: "Nothing due today",
    emptyBody: "Enjoy the quiet — or get a head start on what's coming.",
    action: true,
  },
  upcoming: {
    title: "Upcoming",
    emptyTitle: "Nothing coming up",
    emptyBody: "Tasks with a future due date will land here.",
    action: true,
  },
  overdue: {
    title: "Overdue",
    emptyTitle: "Nothing overdue",
    emptyBody: "You're all caught up.",
    action: false,
  },
  all: {
    title: "All",
    emptyTitle: "No active tasks",
    emptyBody: "Everything's done, or nothing's started.",
    action: true,
  },
};

export function viewTitle(view: SmartView): string {
  return VIEW_COPY[view].title;
}

export function SmartViewScreen({
  view,
  initial,
}: {
  view: SmartView;
  /** The server-rendered first page (technical-design §5.4). */
  initial: SmartViewResponse;
}) {
  // Only the APPENDED pages are state; the first page is always the server's
  // current answer. Snapshotting `initial` into state instead would freeze this
  // screen at mount: `router.refresh()` re-renders the page and hands down new
  // props, but `useState`'s initial value is read once — so completing a task
  // would leave its row on screen, and FEAT-019's cross-device refresh would
  // reach every surface except this one.
  const [appended, setAppended] = useState<SearchResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [seed, setSeed] = useState<SmartViewResponse>(initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = VIEW_COPY[view];

  // A new server page means the data changed underneath us (a completed task, a
  // write from another device). React's adjust-state-on-prop-change: drop the
  // appended pages rather than keep rows the server may no longer place in this
  // view — a stale row here is a wrong answer, and re-paging is one click.
  if (seed !== initial) {
    setSeed(initial);
    setAppended([]);
    setCursor(initial.nextCursor);
  }

  const results = appended.length
    ? [...initial.results, ...appended]
    : initial.results;
  const nextCursor = cursor;

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    const outcome = await loadMoreView(view, nextCursor);
    setLoadingMore(false);
    if (outcome.kind === "unauthenticated") {
      window.location.assign("/signin");
      return;
    }
    if (outcome.kind === "error") {
      setError("Couldn't load more tasks.");
      return;
    }
    // Append — "Load more" adds to what is read, it does not replace it.
    setAppended((prev) => [...prev, ...outcome.data.results]);
    setCursor(outcome.data.nextCursor);
  }

  return (
    <>
      <header style={{ marginBottom: "var(--space-5)" }}>
        <h1
          data-testid="view-title"
          style={{
            margin: 0,
            fontSize: "var(--font-size-h1)",
            lineHeight: "var(--font-line-height-h1)",
            color: "var(--color-text)",
          }}
        >
          {copy.title}
        </h1>
        {results.length > 0 && (
          <p
            data-testid="view-subtitle"
            style={{
              margin: "var(--space-1) 0 0",
              fontSize: "var(--font-size-small)",
              color: "var(--color-text-muted)",
            }}
          >
            {/* "so far" while a cursor remains: the contract deliberately
                carries no total, so claiming one would be inventing it. */}
            {results.length} {results.length === 1 ? "task" : "tasks"}
            {nextCursor ? " so far" : ""}
          </p>
        )}
      </header>

      {results.length === 0 ? (
        <EmptyState copy={copy} view={view} />
      ) : (
        <>
          <ul
            data-testid="view-tasks"
            style={{ listStyle: "none", margin: 0, padding: 0 }}
          >
            {results.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>

          {error && (
            <p
              role="alert"
              data-testid="view-more-error"
              style={{
                margin: "var(--space-4) 0 0",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-danger-subtle)",
                // Never `--color-danger` on this tint — 3.95:1 (DEF-003/006).
                color: "var(--color-danger-text)",
                fontSize: "var(--font-size-small)",
              }}
            >
              {error}
            </p>
          )}

          {nextCursor && (
            <button
              type="button"
              data-testid="view-load-more"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              style={{
                marginTop: "var(--space-5)",
                minHeight: "var(--size-touch-target)",
                padding: "0 var(--space-5)",
                borderRadius: "var(--radius-md)",
                border:
                  "var(--border-width-hairline) solid var(--color-border-strong)",
                background: "var(--color-surface)",
                color: "var(--color-text)",
                fontSize: "var(--font-size-body)",
                cursor: loadingMore ? "not-allowed" : "pointer",
                opacity: loadingMore ? 0.6 : 1,
              }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </>
  );
}

/** design.md §4 `task-row` in full — checkbox + title + right cluster — plus the
 * originating list as a `badge`, which is what makes this a cross-list view
 * (UC-014 step 3). The badge reuses the attribution pattern the 2026-07-31
 * `command-search` amendment settled for SCR-WEB-012.
 *
 * The checkbox is a SIBLING of the row link, never nested inside it (FEAT-012
 * technical-design D6): an interactive control inside an anchor is invalid
 * markup with undefined activation. */
function TaskRow({ task }: { task: SearchResult }) {
  return (
    <li
      data-testid="view-task-row"
      data-task-title={task.title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-1)",
        paddingLeft: "var(--space-1)",
        borderBottom: "var(--border-width-hairline) solid var(--color-border)",
      }}
    >
      <TaskCheckbox
        taskId={task.id}
        completed={false}
        label={`Mark ${task.title} complete`}
      />
      <Link
        href={`/tasks/${task.id}`}
        className="view-row"
        data-testid="view-task-link"
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          alignItems: "center",
          gap: "var(--space-3)",
          minHeight: "var(--size-touch-target)",
          padding: "var(--space-2) var(--space-3)",
          color: "var(--color-text)",
          fontSize: "var(--font-size-body)",
          textDecoration: "none",
        }}
      >
        <span
          className="view-row-title"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {task.title}
        </span>
        {/* Not optional and not first to drop (ui-design D7): in a cross-list
            view this is the answer to "where does this live?". */}
        <span
          data-testid="view-list-badge"
          style={{
            flex: "none",
            maxWidth: "10rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            padding: "0 var(--space-2)",
            borderRadius: "var(--radius-full)",
            background: "var(--color-primary-subtle)",
            color: "var(--color-primary)",
            fontSize: "var(--font-size-caption)",
            lineHeight: "var(--size-control-sm)",
          }}
        >
          {task.listName}
        </span>
        {task.dueAt && (
          <DueChip dueAt={task.dueAt} isOverdue={task.isOverdue} />
        )}
        <PriorityDot priority={task.priority} />
      </Link>
    </li>
  );
}

/** design.md §4's empty convention — icon slot + h3 + one-line subtext + a
 * primary action — with copy per view (D3). The action is a link to `/`, the
 * caller's default list (FEAT-010 technical-design D2): the nearest place a
 * task can actually be created, since a cross-list view has no list to create
 * into (D1). */
function EmptyState({
  copy,
  view,
}: {
  copy: (typeof VIEW_COPY)[SmartView];
  view: SmartView;
}) {
  return (
    <div
      data-testid="view-empty"
      data-view={view}
      style={{
        padding: "var(--space-10) var(--space-4)",
        textAlign: "center",
        color: "var(--color-text-muted)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          fontSize: "var(--font-size-h1)",
          color: "var(--color-text-subtle)",
          marginBottom: "var(--space-2)",
        }}
      >
        ☐
      </div>
      <h3
        style={{
          margin: `0 0 var(--space-1)`,
          fontSize: "var(--font-size-h3)",
          color: "var(--color-text)",
        }}
      >
        {copy.emptyTitle}
      </h3>
      <p style={{ margin: 0, fontSize: "var(--font-size-body)" }}>
        {copy.emptyBody}
      </p>
      {copy.action && (
        <Link
          href="/"
          data-testid="view-empty-action"
          style={{
            display: "inline-flex",
            alignItems: "center",
            marginTop: "var(--space-5)",
            minHeight: "var(--size-touch-target)",
            padding: "0 var(--space-5)",
            borderRadius: "var(--radius-md)",
            border:
              "var(--border-width-hairline) solid var(--color-border-strong)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-body)",
            textDecoration: "none",
          }}
        >
          Add a task
        </Link>
      )}
    </div>
  );
}

/** SCR-WEB-009's `error` and `not-found` states. In-shell: the sidebar stays
 * operable, so a failed view never strands the frame (NFR-USE-003).
 *
 * `not-found` carries no Retry — retrying a view name that does not exist
 * cannot succeed. The treatment matches `list-view-failure.tsx` rather than
 * reusing it: that component's copy is list-specific, and generalizing it means
 * editing a shipped FEAT-010 component (the call FEAT-013 D1 made the same way).
 * Recorded as a gap on the manifest entry, owner a foundations pass.
 *
 * `--color-danger-text` on the danger tint, never `--color-danger` (3.95:1 —
 * DEF-003/DEF-006), and `--color-primary-hover` for the action (6.21:1 on that
 * tint, where plain primary is 4.48:1). */
export function SmartViewFailure({
  kind,
}: {
  kind: "not-found" | "error";
}) {
  const router = useRouter();
  const notFound = kind === "not-found";

  return (
    <div
      role="alert"
      data-testid={notFound ? "view-not-found" : "view-error"}
      style={{
        padding: "var(--space-5)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-danger-subtle)",
        color: "var(--color-danger-text)",
        fontSize: "var(--font-size-body)",
      }}
    >
      <p style={{ margin: `0 0 var(--space-3)` }}>
        {notFound ? "That view doesn't exist." : "Couldn't load this view."}
      </p>
      {notFound ? (
        <Link
          href="/"
          data-testid="view-back-home"
          style={{ color: "var(--color-primary-hover)" }}
        >
          Back to your lists
        </Link>
      ) : (
        <button
          type="button"
          data-testid="view-retry"
          onClick={() => router.refresh()}
          style={{
            minHeight: "var(--size-touch-target)",
            padding: "0 var(--space-4)",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: "transparent",
            color: "var(--color-primary-hover)",
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
