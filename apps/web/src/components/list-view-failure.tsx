"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// SCR-WEB-008's `error` and `not-found` states (FEAT-010 ui-design). Both are
// in-shell: the sidebar and its navigation stay operable, because a data failure
// must never strand the frame (NFR-USE-003). `not-found` is the uniform answer
// for an unknown OR unowned list — it says nothing about which (FR-AUTHZ-003).
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
        color: "var(--color-danger)",
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
          style={{ color: "var(--color-primary)" }}
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
            color: "var(--color-primary)",
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
