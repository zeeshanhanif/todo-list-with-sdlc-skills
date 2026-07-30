"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// SCR-WEB-008's `error` and `not-found` states (FEAT-010 ui-design). Both are
// in-shell: the sidebar and its navigation stay operable, because a data failure
// must never strand the frame (NFR-USE-003). `not-found` is the uniform answer
// for an unknown OR unowned list — it says nothing about which (FR-AUTHZ-003).
//
// **Text on a tint takes the tint's partner token (DEF-003).** When this
// component shipped, `--color-danger` was the only danger text colour that
// existed and it measures 3.95:1 on `--color-danger-subtle` — under the 4.5:1
// design.md §5 requires. `--color-danger-text` (6.80:1) was added by the
// 2026-07-28 amendment and is the correct partner. The action below takes
// `--color-primary-hover` for the same reason: plain `--color-primary` is
// 4.48:1 on this tint, while primary-hover is 6.21:1 — the pairing design.md §2
// already documents for `--color-primary-subtle` ("use with #115E59 text").
// All values are design tokens.
export function ListViewFailure({ kind }: { kind: "not-found" | "error" }) {
  const router = useRouter();
  const notFound = kind === "not-found";

  return (
    <div
      role="alert"
      data-testid={notFound ? "list-not-found" : "list-error"}
      style={{
        padding: "var(--space-5)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-danger-subtle)",
        color: "var(--color-danger-text)",
        fontSize: "var(--font-size-body)",
      }}
    >
      <p style={{ margin: `0 0 var(--space-3)` }}>
        {notFound ? "That list doesn't exist." : "Couldn't load this list."}
      </p>
      {notFound ? (
        <Link
          href="/"
          data-testid="back-home"
          style={{ color: "var(--color-primary-hover)" }}
        >
          Back to your lists
        </Link>
      ) : (
        <button
          type="button"
          data-testid="list-retry"
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
