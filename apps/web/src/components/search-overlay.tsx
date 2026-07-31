"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  SEARCH_DUE_BUCKETS,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_STATUSES,
  type SearchDueBucket,
  type SearchResult,
  type SearchStatus,
} from "@todo/shared";
import { DueChip, PriorityDot } from "@/components/task-meta";
import { hasCriteria, searchTasks, type SearchParams } from "@/lib/search";

// SCR-WEB-012 — Search (ui-design.md). An overlay, not a route: opened from the
// shell, closed back to whatever the user was doing (ui-design D1).
//
// States, all four from the inventory plus error: **idle** (nothing asked yet),
// **loading**, **results**, **empty** (asked, nothing matched), **error**.
// idle and empty are distinct BY CONSTRUCTION — idle has no criteria to echo,
// which is the client half of technical-design D6.
// All values are design tokens.

const STATUS_LABELS: Record<SearchStatus, string> = {
  active: "Active",
  completed: "Completed",
  overdue: "Overdue",
};

const DUE_LABELS: Record<SearchDueBucket, string> = {
  today: "Today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  none: "No due date",
};

/** design.md §2/§5's control-boundary rule: a control identified only by its
 * outline takes `--color-text-muted`, never `--color-border-strong` (DEF-005). */
const controlStyle = {
  height: "var(--size-control-md)",
  padding: "0 var(--space-3)",
  borderRadius: "var(--radius-md)",
  border: "var(--border-width-hairline) solid var(--color-text-muted)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body)",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  marginBottom: "var(--space-1)",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-text)",
};

const DEBOUNCE_MS = 250;

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SearchStatus | "">("");
  const [due, setDue] = useState<SearchDueBucket | "">("");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Has a search actually been performed? What separates empty from idle. */
  const [searched, setSearched] = useState(false);

  const params: SearchParams = { q, status, due };
  const active = hasCriteria(params);

  // Every in-flight request carries the criteria it was issued for, so a slow
  // response for "rep" cannot overwrite a fast one for "report" (ui-design D5).
  const requestId = useRef(0);

  const run = useCallback(async (p: SearchParams, id: number) => {
    const outcome = await searchTasks(p);
    if (requestId.current !== id) return; // superseded — discard silently
    if (outcome.kind === "ok") {
      setResults(outcome.data.results);
      setNextCursor(outcome.data.nextCursor);
      setError(null);
    } else if (outcome.kind === "unauthenticated") {
      window.location.assign("/signin");
      return;
    } else if (outcome.message) {
      setError(outcome.message);
    }
    setLoading(false);
    setSearched(true);
  }, []);

  /**
   * Adjust the panel's state where the change happens — in the handler — rather
   * than in an effect. React's own guidance, and the hooks lint enforces it:
   * an effect that synchronously sets state cascades renders. The effect below
   * keeps only what is genuinely a sync with an external system: the debounced
   * request.
   */
  const applyCriteria = (next: SearchParams) => {
    if (hasCriteria(next)) {
      setLoading(true);
      setError(null);
      return;
    }
    // Back to idle: cancel anything in flight and forget the last answer, so
    // the idle state cannot show results from a question no longer being asked.
    requestId.current += 1;
    setResults([]);
    setNextCursor(null);
    setError(null);
    setSearched(false);
    setLoading(false);
  };

  // Debounced fetch. Results are NOT cleared while a new request is in flight —
  // clearing makes every keystroke flash the panel empty, which reads as "no
  // matches" a dozen times while a word is typed (ui-design D5).
  useEffect(() => {
    if (!active) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      void run({ q, status, due }, id);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, status, due, active, run]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    const outcome = await searchTasks({ q, status, due, cursor: nextCursor });
    if (outcome.kind === "ok") {
      // Append — "Load more" adds to what is read, it does not replace it (D4).
      setResults((prev) => [...prev, ...outcome.data.results]);
      setNextCursor(outcome.data.nextCursor);
    } else if (outcome.kind === "unauthenticated") {
      window.location.assign("/signin");
      return;
    } else if (outcome.message) {
      setError(outcome.message);
    }
    setLoadingMore(false);
  };

  // design.md §5: Esc closes, focus is trapped while open and restored on
  // close. Implemented rather than assumed — the element claims aria-modal,
  // and that claim has to be true (the acceptance finding FEAT-011 R2 recorded
  // for the detail panel; the same rule, the same implementation).
  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement as HTMLElement | null;

    const tabbables = (): HTMLElement[] =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // ↑/↓ move through the results from wherever focus is — which, while the
      // user is typing, is the query field, not the list (ui-design D6). A
      // handler bound to the list itself never fires from there; that is the
      // bug this arrangement fixes. A `select` keeps its own arrow behaviour.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const target = e.target as HTMLElement;
        if (target.tagName === "SELECT") return;
        const links = Array.from(
          node?.querySelectorAll<HTMLAnchorElement>(
            '[data-testid="search-results"] a[href]',
          ) ?? [],
        );
        if (links.length === 0) return;
        e.preventDefault();
        const at = links.indexOf(document.activeElement as HTMLAnchorElement);
        if (at === -1) {
          links[0].focus();
          return;
        }
        const next =
          e.key === "ArrowDown"
            ? Math.min(at + 1, links.length - 1)
            : Math.max(at - 1, 0);
        links[next].focus();
        return;
      }

      if (e.key !== "Tab") return;
      const items = tabbables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!e.shiftKey && (document.activeElement === last || !node?.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (document.activeElement === first || !node?.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    queryInput.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onClose]);

  const criteriaSummary = [
    q.trim() ? `keyword “${q.trim()}”` : null,
    status ? STATUS_LABELS[status].toLowerCase() : null,
    due ? DUE_LABELS[due].toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      data-testid="search-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-overlay)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "var(--space-8) var(--space-4)",
        zIndex: 50,
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Search tasks"
        data-testid="search-overlay"
        tabIndex={-1}
        style={{
          width: "100%",
          maxWidth: "var(--size-content-max)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface)",
          border: "var(--border-width-hairline) solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "var(--space-5)" }}>
          <label htmlFor="search-q" style={labelStyle}>
            Search
          </label>
          <input
            id="search-q"
            ref={queryInput}
            type="search"
            data-testid="search-input"
            placeholder="Search your tasks"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              applyCriteria({ q: e.target.value, status, due });
            }}
            style={{ ...controlStyle, width: "100%" }}
          />

          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              marginTop: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 12rem" }}>
              <label htmlFor="search-status" style={labelStyle}>
                Status
              </label>
              <select
                id="search-status"
                data-testid="search-status"
                value={status}
                onChange={(e) => {
                  const value = e.target.value as SearchStatus | "";
                  setStatus(value);
                  applyCriteria({ q, status: value, due });
                }}
                style={{ ...controlStyle, width: "100%" }}
              >
                {/* "Any" is the ABSENCE of the parameter, not a value sent. */}
                <option value="">Any</option>
                {SEARCH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 12rem" }}>
              <label htmlFor="search-due" style={labelStyle}>
                Due
              </label>
              <select
                id="search-due"
                data-testid="search-due"
                value={due}
                onChange={(e) => {
                  const value = e.target.value as SearchDueBucket | "";
                  setDue(value);
                  applyCriteria({ q, status, due: value });
                }}
                style={{ ...controlStyle, width: "100%" }}
              >
                <option value="">Any</option>
                {SEARCH_DUE_BUCKETS.map((d) => (
                  <option key={d} value={d}>
                    {DUE_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error ? (
          <div
            data-testid="search-error"
            role="alert"
            style={{
              margin: "0 var(--space-5) var(--space-4)",
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-danger-subtle)",
              // The tint's PARTNER token — `--color-danger` here is 3.95:1
              // (design.md §5; the DEF-003/DEF-006 pairing).
              color: "var(--color-danger-text)",
              fontSize: "var(--font-size-small)",
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          data-testid="search-results-region"
          aria-live="polite"
          style={{
            borderTop: "var(--border-width-hairline) solid var(--color-border)",
            overflowY: "auto",
            padding: "var(--space-4) var(--space-5) var(--space-5)",
          }}
        >
          {!active ? (
            <p
              data-testid="search-idle"
              style={{
                margin: 0,
                color: "var(--color-text-muted)",
                fontSize: "var(--font-size-body)",
              }}
            >
              Search by keyword, or filter by status and due date.
            </p>
          ) : loading && results.length === 0 ? (
            <p
              data-testid="search-loading"
              style={{
                margin: 0,
                color: "var(--color-text-muted)",
                fontSize: "var(--font-size-body)",
              }}
            >
              Searching…
            </p>
          ) : searched && results.length === 0 ? (
            <div data-testid="search-empty">
              <p
                style={{
                  margin: 0,
                  color: "var(--color-text)",
                  fontSize: "var(--font-size-body)",
                }}
              >
                No tasks match.
              </p>
              <p
                style={{
                  margin: "var(--space-1) 0 var(--space-3)",
                  color: "var(--color-text-muted)",
                  fontSize: "var(--font-size-small)",
                }}
              >
                {criteriaSummary}
              </p>
              {status || due ? (
                <button
                  type="button"
                  data-testid="search-clear-filters"
                  onClick={() => {
                    setStatus("");
                    setDue("");
                    applyCriteria({ q, status: "", due: "" });
                  }}
                  style={{
                    minHeight: "var(--size-touch-target)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--color-primary)",
                    fontSize: "var(--font-size-body)",
                    cursor: "pointer",
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <p
                data-testid="search-count"
                style={{
                  margin: "0 0 var(--space-3)",
                  color: "var(--color-text-muted)",
                  fontSize: "var(--font-size-small)",
                }}
              >
                {results.length} result{results.length === 1 ? "" : "s"}
                {nextCursor ? " so far" : ""}
              </p>
              <ul
                data-testid="search-results"
                style={{ listStyle: "none", margin: 0, padding: 0 }}
              >
                {results.map((r) => (
                  <ResultRow key={r.id} result={r} onNavigate={onClose} />
                ))}
              </ul>
              {nextCursor ? (
                <button
                  type="button"
                  data-testid="search-load-more"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  style={{
                    marginTop: "var(--space-4)",
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
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A result row: every READ affordance of design.md's `task-row` and neither
 * write control (ui-design D2). No complete-checkbox and no drag handle —
 * this feature writes nothing, and a control that cannot act is worse than an
 * absent one ("omit rather than fake", FEAT-010 ui-design D2).
 */
function ResultRow({
  result,
  onNavigate,
}: {
  result: SearchResult;
  onNavigate: () => void;
}) {
  const completed = result.completedAt !== null;
  return (
    <li data-testid="search-result" data-title={result.title}>
      <Link
        href={`/tasks/${result.id}`}
        onClick={onNavigate}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          minHeight: "var(--size-touch-target)",
          padding: "var(--space-2) var(--space-2)",
          borderRadius: "var(--radius-md)",
          textDecoration: "none",
        }}
      >
        <PriorityDot priority={result.priority} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            color: completed ? "var(--color-text-muted)" : "var(--color-text)",
            fontSize: "var(--font-size-body)",
            textDecoration: completed ? "line-through" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {result.title}
        </span>
        {/* FR-SRCH-002's "the list it belongs to" — a badge per result, which
            is what design.md §4's `command-search` specifies as of the
            2026-07-31 amendment. */}
        <span
          data-testid="search-result-list"
          style={{
            flexShrink: 0,
            padding: "0 var(--space-2)",
            borderRadius: "var(--radius-full)",
            background: "var(--color-primary-subtle)",
            color: "var(--color-primary)",
            fontSize: "var(--font-size-caption)",
            whiteSpace: "nowrap",
          }}
        >
          {result.listName}
        </span>
        {result.dueAt ? (
          <DueChip dueAt={result.dueAt} isOverdue={result.isOverdue} />
        ) : null}
      </Link>
    </li>
  );
}
