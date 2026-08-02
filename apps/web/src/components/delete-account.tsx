"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ListsResponse } from "@todo/shared";
import { requestAccountDelete } from "@/lib/account-delete";

// SCR-WEB-017 island (ui-design.md). Consumes POST /api/account/delete (BFF →
// API) and GET /api/lists for the counts (ui-design D4 — no preview endpoint).
// States: default, deleting, password-error, error, confirmed, plus the
// unauthenticated redirect FEAT-006 D4 established.
// All values are design tokens.

/** What the warning quantifies. `null` while loading, `"failed"` when the count
 * request failed — which degrades the copy and never blocks the action or
 * renders a zero (ui-design D5). */
type Counts = { lists: number; tasks: number } | null | "failed";

type State =
  | { kind: "default" }
  | { kind: "confirming" }
  | { kind: "deleting" }
  | { kind: "confirmed" };

const labelStyle = {
  display: "block",
  marginBottom: "var(--space-1)",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-text)",
};

const helpStyle = {
  margin: "var(--space-1) 0 0",
  fontSize: "var(--font-size-small)",
  color: "var(--color-text-muted)",
};

const bulletStyle = {
  marginBottom: "var(--space-2)",
  color: "var(--color-text-muted)",
  fontSize: "var(--font-size-small)",
};

/** The danger `inline-alert` (design.md §4): tinted background with the tint's
 * PARTNER ink. Never `--color-danger` on this tint — 3.95:1, the pairing DEF-006
 * fixed across seven screens. */
const alertStyle = {
  display: "block",
  padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-danger-subtle)",
  color: "var(--color-danger-text)",
  fontSize: "var(--font-size-small)",
};

export function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>(null);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({ kind: "default" });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const confirming = state.kind === "confirming";
  const deleting = state.kind === "deleting";
  const dialogOpen = confirming || deleting;

  // The counts (ui-design D4). One read, on mount, from the contract FEAT-009
  // already ships — `taskCount` includes soft-deleted tasks, which is exactly
  // the set about to be destroyed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/lists", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as ListsResponse;
        if (cancelled) return;
        setCounts({
          lists: body.lists.length,
          tasks: body.lists.reduce((n, l) => n + l.taskCount, 0),
        });
      } catch {
        if (!cancelled) setCounts("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus the safe button when the dialog opens (ui-design D3): the user just
  // pressed Enter in a password field, and a stray second Enter must not
  // destroy the account.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  // Esc closes and Tab is trapped (design.md §4/§5) — both suspended while the
  // request is in flight, since there is nothing left to cancel.
  useEffect(() => {
    if (!dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (deleting) return;
      if (e.key === "Escape") {
        closeDialog();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
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
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen, deleting]);

  function closeDialog(): void {
    setState({ kind: "default" });
    triggerRef.current?.focus();
  }

  /** The page's button never submits — it validates and raises the dialog. A
   * destructive confirmation must not be raised for a request that is already
   * going to fail (ui-design SCR-WEB-017 default). */
  function onRequestDelete(e?: React.FormEvent): void {
    e?.preventDefault();
    setFormError(null);
    if (password.trim().length === 0) {
      setFieldError("Enter your password to continue.");
      passwordRef.current?.focus();
      return;
    }
    setFieldError(null);
    setState({ kind: "confirming" });
  }

  /** The dialog's confirm — the only caller that sends `confirm: true`. */
  async function onConfirm(): Promise<void> {
    setState({ kind: "deleting" });
    const result = await requestAccountDelete({ currentPassword: password });

    if (result.ok) {
      setState({ kind: "confirmed" });
      return;
    }

    // Every failure closes the dialog: the confirmation is spent and must be
    // re-earned.
    setState({ kind: "default" });

    if (result.reason === "unauthenticated") {
      router.push("/signin");
      return;
    }
    if (result.reason === "invalid_password") {
      setFieldError("That password doesn’t match. Nothing has been deleted.");
      passwordRef.current?.focus();
      return;
    }
    if (result.reason === "rate_limited") {
      const wait = result.retryAfterSeconds;
      setFormError(
        wait
          ? `Too many attempts. Try again in about ${wait} ${wait === 1 ? "second" : "seconds"}.`
          : "Too many attempts. Wait a moment and try again.",
      );
      return;
    }
    setFormError(
      "Couldn’t delete your account just now. Nothing has been deleted — try again.",
    );
  }

  // FR-DATA-006's "after": rendered from client state with no navigation and no
  // server round-trip. By now the session is gone, so a refresh or a push to any
  // authenticated route would resolve no session and replace this message with
  // the sign-in form (technical-design D10).
  if (state.kind === "confirmed") {
    return (
      <section
        data-testid="deleted-card"
        role="status"
        aria-live="polite"
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
          Your account has been deleted
        </h2>
        <p
          style={{
            margin: "0 0 var(--space-5)",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-body)",
          }}
        >
          Your lists, your tasks and your account details have been permanently
          removed.{" "}
          <strong style={{ color: "var(--color-text)" }}>{email}</strong> is free
          to use for a new account whenever you like.
        </p>
        {/* The only affordance: everything else on the shell now leads to a
            redirect (ui-design open item 1). */}
        <Link
          href="/signin"
          data-testid="deleted-signin"
          style={{
            display: "inline-block",
            height: "var(--size-control-lg)",
            lineHeight: "var(--size-control-lg)",
            padding: "0 var(--space-5)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-primary)",
            color: "var(--color-on-primary)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-medium)" as unknown as number,
            textDecoration: "none",
          }}
        >
          Go to sign in
        </Link>
      </section>
    );
  }

  const countLine =
    counts === null
      ? "Loading what’s in your account…"
      : counts === "failed"
        ? "your lists and tasks"
        : `${counts.lists} ${counts.lists === 1 ? "list" : "lists"} and ${counts.tasks} ${counts.tasks === 1 ? "task" : "tasks"}`;

  return (
    <>
      <section
        data-testid="delete-card"
        style={{
          background: "var(--color-surface)",
          border: "var(--border-width-hairline) solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          padding: "var(--space-5)",
        }}
      >
        {formError && (
          <div
            data-testid="delete-error"
            role="alert"
            style={{ ...alertStyle, marginBottom: "var(--space-4)" }}
          >
            <p style={{ margin: 0 }}>{formError}</p>
            <button
              type="button"
              data-testid="delete-retry"
              onClick={() => onRequestDelete()}
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

        {/* The permanence notice (FR-DATA-006's "before"). Carries an icon as
            well as colour — design.md §7: never meaning by colour alone. */}
        <div data-testid="delete-warning" role="note" style={alertStyle}>
          <strong>
            <WarningGlyph /> This is permanent.
          </strong>{" "}
          Deleting your account removes everything in it. We can’t undo it, and
          we can’t get it back for you.
        </div>

        <h2
          style={{
            margin: "var(--space-5) 0 var(--space-3)",
            fontSize: "var(--font-size-h3)",
            lineHeight: "var(--font-line-height-h3)",
            color: "var(--color-text)",
          }}
        >
          What gets deleted
        </h2>
        <ul
          style={{
            margin: "0 0 var(--space-5)",
            paddingLeft: "var(--space-5)",
            listStyle: "disc",
          }}
        >
          <li style={bulletStyle} data-testid="delete-counts">
            {/* --color-text, not muted: the number is the most legible thing in
                the list, because it is the one that quantifies the loss. */}
            <strong style={{ color: "var(--color-text)" }}>{countLine}</strong>
            {counts === "failed" ? "" : " — including the ones you’ve deleted"}
          </li>
          <li style={bulletStyle}>
            Your account details — email, display name, timezone and theme
          </li>
          <li style={bulletStyle}>
            Every device you’re signed in on will be signed out
          </li>
        </ul>

        {/* There is no import path (FEAT-017 §8): the export is the only copy a
            user can ever hold, and this is the last moment it can be made. */}
        <p style={{ margin: "0 0 var(--space-5)", fontSize: "var(--font-size-body)" }}>
          Want a copy first?{" "}
          <Link
            href="/settings/security/export"
            data-testid="export-first"
            style={{ color: "var(--color-primary)" }}
          >
            Export your data
          </Link>
        </p>

        <form onSubmit={onRequestDelete} noValidate>
          <label htmlFor="delete-password" style={labelStyle}>
            Confirm your password
          </label>
          <input
            id="delete-password"
            ref={passwordRef}
            data-testid="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={
              fieldError ? "delete-password-error" : "delete-password-help"
            }
            style={{
              width: "100%",
              height: "var(--size-control-md)",
              padding: "0 var(--space-3)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-body)",
              boxSizing: "border-box",
              // The control-boundary rule (design.md §2): the fill alone does
              // not distinguish the field from the card.
              border: `var(--border-width-hairline) solid ${
                fieldError ? "var(--color-danger)" : "var(--color-text-muted)"
              }`,
            }}
          />
          {fieldError ? (
            <p
              id="delete-password-error"
              data-testid="delete-password-error"
              style={{
                margin: "var(--space-1) 0 0",
                fontSize: "var(--font-size-small)",
                // On the card's `--color-surface`, where `--color-danger` is
                // 4.8:1 — the field-error convention, design.md §4.
                color: "var(--color-danger)",
              }}
            >
              {fieldError}
            </p>
          ) : (
            <p id="delete-password-help" style={helpStyle}>
              We ask for it because this can’t be undone.
            </p>
          )}

          <button
            type="submit"
            ref={triggerRef}
            data-testid="delete-button"
            className="card-action-full"
            style={{
              marginTop: "var(--space-5)",
              height: "var(--size-control-lg)",
              padding: "0 var(--space-5)",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "var(--color-danger)",
              color: "var(--color-on-primary)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)" as unknown as number,
              cursor: "pointer",
            }}
          >
            Delete my account
          </button>
        </form>
      </section>

      {dialogOpen && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) closeDialog();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-4)",
            background: "var(--color-overlay)",
          }}
        >
          <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            data-testid="delete-dialog"
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--color-surface)",
              border: "var(--border-width-hairline) solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              padding: "var(--space-6)",
              boxSizing: "border-box",
            }}
          >
            <h3
              id="delete-dialog-title"
              style={{
                margin: 0,
                fontSize: "var(--font-size-h3)",
                color: "var(--color-text)",
              }}
            >
              Delete your account?
            </h3>
            <p
              data-testid="delete-dialog-body"
              style={{
                margin: "var(--space-4) 0 0",
                color: "var(--color-text-muted)",
                fontSize: "var(--font-size-body)",
              }}
            >
              This permanently deletes your account,{" "}
              <strong style={{ color: "var(--color-text)" }}>{countLine}</strong>
              . It can’t be undone.
            </p>

            <div className="form-actions" style={{ marginTop: "var(--space-6)" }}>
              {/* Cancel first in the DOM so it takes focus and Shift+Tab order
                  reads naturally; the row reverses nothing — design.md's
                  confirm-dialog puts cancel before the destructive action. */}
              <button
                type="button"
                ref={cancelRef}
                data-testid="delete-dialog-cancel"
                disabled={deleting}
                onClick={closeDialog}
                style={{
                  flex: 1,
                  height: "var(--size-control-lg)",
                  padding: "0 var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  border:
                    "var(--border-width-hairline) solid var(--color-border-strong)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontSize: "var(--font-size-body)",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="delete-dialog-confirm"
                disabled={deleting}
                onClick={() => void onConfirm()}
                style={{
                  flex: 1,
                  height: "var(--size-control-lg)",
                  padding: "0 var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--color-danger)",
                  color: "var(--color-on-primary)",
                  fontSize: "var(--font-size-body)",
                  fontWeight: "var(--font-weight-medium)" as unknown as number,
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? "Deleting…" : "Yes, delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Decorative alert mark, `aria-hidden` because the sentence beside it already
 * says "This is permanent" — the icon pairs with the text rather than carrying
 * meaning alone (design.md §7). `currentColor` so it inherits the tint's
 * partner ink and can never drift from it. */
function WarningGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      // `inline-block` explicitly: Tailwind's preflight sets `svg { display:
      // block }`, which would drop the mark onto its own line above the text.
      style={{
        display: "inline-block",
        verticalAlign: "-2px",
        marginRight: "var(--space-1)",
      }}
    >
      <path d="M12 3 1.8 20.5h20.4L12 3Z" />
      <path d="M12 9.5v5" />
      <path d="M12 17.6v.1" />
    </svg>
  );
}
