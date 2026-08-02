"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { downloadDocument, requestExport } from "@/lib/account-export";

// SCR-WEB-016 island (ui-design.md). Consumes POST /api/account/export
// (BFF → API). States: default, preparing, ready, error (ui-design's state
// supplement) plus the unauthenticated redirect FEAT-006 D4 established.
// All values are design tokens.

type Ready = { filename: string; lists: number; tasks: number };
type State =
  | { kind: "default" }
  | { kind: "preparing" }
  | { kind: "ready"; ready: Ready }
  | { kind: "error" };

const bulletStyle = {
  marginBottom: "var(--space-2)",
  color: "var(--color-text-muted)",
  fontSize: "var(--font-size-small)",
};

export function ExportData() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "default" });
  const preparing = state.kind === "preparing";

  async function onExport() {
    setState({ kind: "preparing" });
    const result = await requestExport();

    if (!result.ok) {
      if (result.reason === "unauthenticated") {
        router.push("/signin");
        return;
      }
      setState({ kind: "error" });
      return;
    }

    downloadDocument(result.document, result.filename);
    setState({
      kind: "ready",
      ready: {
        filename: result.filename,
        lists: result.document.lists.length,
        // Counted from the document already in hand — never a second endpoint
        // (ui-design D3).
        tasks: result.document.lists.reduce((n, l) => n + l.tasks.length, 0),
      },
    });
  }

  return (
    <section
      data-testid="export-card"
      style={{
        background: "var(--color-surface)",
        border: "var(--border-width-hairline) solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "var(--space-5)",
      }}
    >
      <h2
        style={{
          margin: "0 0 var(--space-3)",
          fontSize: "var(--font-size-h3)",
          lineHeight: "var(--font-line-height-h3)",
          color: "var(--color-text)",
        }}
      >
        What&rsquo;s in the file
      </h2>

      {/* `listStyle` is set explicitly because the global reset clears it:
          design.md §5 wants real ul/li semantics, and an indent with no marker
          reads as an ambiguous block rather than a list. */}
      <ul
        style={{
          margin: "0 0 var(--space-5)",
          paddingLeft: "var(--space-5)",
          listStyle: "disc",
        }}
      >
        <li style={bulletStyle}>
          Your account details — email, display name, timezone and theme
        </li>
        <li style={bulletStyle}>
          All of your lists, in the order you arranged them
        </li>
        <li style={bulletStyle}>
          Every task in them, active and completed, with due dates and priorities
        </li>
        {/* Required, not editorial: the export excludes soft-deleted tasks
            (technical-design D7), and FEAT-013's 30-day window means a user can
            act on this sentence. A screen that let them believe otherwise would
            be lying about the only thing it does. */}
        <li style={bulletStyle} data-testid="deleted-note">
          <strong style={{ color: "var(--color-text)" }}>Not</strong>{" "}
          the tasks you&rsquo;ve deleted — restore one first if you want it
          included
        </li>
      </ul>

      <button
        type="button"
        data-testid="export-button"
        className="card-action-full"
        onClick={() => void onExport()}
        disabled={preparing}
        style={{
          height: "var(--size-control-lg)",
          padding: "0 var(--space-5)",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: "var(--color-primary)",
          color: "var(--color-on-primary)",
          fontSize: "var(--font-size-body)",
          fontWeight: "var(--font-weight-medium)" as unknown as number,
          cursor: preparing ? "not-allowed" : "pointer",
          opacity: preparing ? 0.6 : 1,
        }}
      >
        {preparing ? "Preparing your export…" : "Export my data"}
      </button>

      {/* The download is a programmatic anchor click, which browsers announce
          inconsistently and screen readers often not at all — without this
          region a success and a silent failure look identical (ui-design D2). */}
      <div
        data-testid="export-status"
        role="status"
        aria-live="polite"
        style={{ marginTop: state.kind === "default" ? 0 : "var(--space-4)" }}
      >
        {preparing && (
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-small)",
              color: "var(--color-text-muted)",
            }}
          >
            Preparing your export…
          </p>
        )}

        {state.kind === "ready" && (
          <div
            data-testid="export-ready"
            style={{
              display: "flex",
              gap: "var(--space-2)",
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-success-subtle)",
              color: "var(--color-success-text)",
              fontSize: "var(--font-size-small)",
            }}
          >
            <span>
              Your export is ready —{" "}
              <strong data-testid="export-filename">
                {state.ready.filename}
              </strong>{" "}
              is in your downloads.{" "}
              <span data-testid="export-counts">
                {state.ready.lists} {state.ready.lists === 1 ? "list" : "lists"}{" "}
                · {state.ready.tasks}{" "}
                {state.ready.tasks === 1 ? "task" : "tasks"}.
              </span>
            </span>
          </div>
        )}

        {state.kind === "error" && (
          <div
            data-testid="export-error"
            role="alert"
            style={{
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-danger-subtle)",
              // NEVER --color-danger here: it measures 3.95:1 on this tint
              // (design.md §5; DEF-006 fixed seven shipped instances).
              color: "var(--color-danger-text)",
              fontSize: "var(--font-size-small)",
            }}
          >
            <p style={{ margin: 0 }}>
              Couldn&rsquo;t build your export just now. Nothing was downloaded —
              try again.
            </p>
            <button
              type="button"
              data-testid="export-retry"
              onClick={() => void onExport()}
              style={{
                marginTop: "var(--space-2)",
                minHeight: "var(--size-touch-target)",
                padding: "0 var(--space-3)",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: "transparent",
                color: "var(--color-danger-text)",
                fontSize: "var(--font-size-small)",
                fontWeight: "var(--font-weight-medium)" as unknown as number,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
