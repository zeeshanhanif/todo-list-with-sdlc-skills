"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ListSummary } from "@todo/shared";
import { ListDialog, type ListDialogMode } from "@/components/list-dialog";

// SCR-WEB-007 lists section (ui-design.md) — the sidebar half of FEAT-009.
// One `sidebar-nav-item` per list in position order, each with an
// activeTaskCount badge that is hidden at zero (ui-design D2), a per-row menu
// (rename / move up / move down / delete), and a "New list" action. The Inbox
// row omits Delete entirely rather than disabling it (D1). Reorder is
// menu-driven, not drag-and-drop (D5) — each move posts the whole order.
// FEAT-010 made rows navigational: each is a link to /lists/{id} (SCR-WEB-008)
// with design.md's selected state for the open list.
// All values are design tokens.

export function ListsNav({
  lists,
  activeListId,
  onNavigate,
}: {
  lists: ListSummary[] | null;
  /** The list currently open — takes the `sidebar-nav-item` selected state
   * (FEAT-010 ui-design; design.md §4). */
  activeListId?: string;
  /** Closes the mobile drawer when a row action is taken. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<ListDialogMode | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  async function move(index: number, delta: number) {
    if (!lists) return;
    const next = [...lists];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOpenMenu(null);
    setReorderError(null);
    try {
      const res = await fetch("/api/lists/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listIds: next.map((l) => l.id) }),
      });
      if (res.status === 401) {
        window.location.assign("/signin");
        return;
      }
      if (!res.ok) {
        setReorderError("Couldn't save the new order.");
        return;
      }
      router.refresh();
    } catch {
      setReorderError("Couldn't save the new order.");
    }
  }

  function afterMutation(message?: string) {
    setDialog(null);
    setOpenMenu(null);
    if (message) {
      setToast(message);
      window.setTimeout(() => setToast(null), 5000);
    }
    // Re-render the server component that fetched the lists, so the sidebar
    // reflects the change without a manual reload (AC-13).
    router.refresh();
  }

  return (
    <div style={{ marginTop: "var(--space-6)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
          paddingLeft: "var(--space-3)",
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Lists
        </span>
        <button
          type="button"
          data-testid="new-list"
          aria-label="New list"
          onClick={() => setDialog({ kind: "create" })}
          style={iconButton}
        >
          +
        </button>
      </div>

      {lists === null ? (
        <div
          role="alert"
          data-testid="lists-error"
          style={{
            marginTop: "var(--space-2)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-danger-subtle)",
            // The tint's PARTNER ink — `--color-danger` here is 3.95:1, under
            // design.md §5's 4.5:1 for body text (DEF-006).
            color: "var(--color-danger-text)",
            fontSize: "var(--font-size-small)",
          }}
        >
          Couldn&rsquo;t load your lists.{" "}
          <button
            type="button"
            data-testid="lists-retry"
            onClick={() => router.refresh()}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              color: "var(--color-primary)",
              fontSize: "var(--font-size-small)",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <ul
          data-testid="lists-nav"
          style={{
            listStyle: "none",
            margin: "var(--space-2) 0 0",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
          }}
        >
          {lists.map((list, index) => {
            const selected = list.id === activeListId;
            return (
            <li key={list.id} style={{ position: "relative" }}>
              <div
                data-testid="list-row"
                data-list-name={list.name}
                data-selected={selected ? "true" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  minHeight: "var(--size-touch-target)",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  // design.md §4 selected state: primary-subtle bg + primary
                  // text + a left accent bar.
                  borderLeft: selected
                    ? "var(--border-width-thick) solid var(--color-primary)"
                    : "var(--border-width-thick) solid transparent",
                  background: selected
                    ? "var(--color-primary-subtle)"
                    : "transparent",
                  color: selected
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
                  fontSize: "var(--font-size-body)",
                }}
              >
                <Link
                  href={`/lists/${list.id}`}
                  title={list.name}
                  data-testid="list-link"
                  aria-current={selected ? "page" : undefined}
                  onClick={onNavigate}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  {list.name}
                </Link>

                {/* Badge hidden at zero — its presence is what carries meaning (D2). */}
                {list.activeTaskCount > 0 && (
                  <span
                    data-testid="list-count"
                    style={{
                      padding: "0 var(--space-2)",
                      borderRadius: "var(--radius-full)",
                      background: "var(--color-surface-sunken)",
                      // Text on the sunken tint takes `--color-text`
                      // (design.md §2): muted here measures 4.34:1, under the
                      // 4.5:1 §5 requires at `caption`. The second instance of
                      // DEF-004, found by grepping the pairing rather than by
                      // stopping at the reported component.
                      color: "var(--color-text)",
                      fontSize: "var(--font-size-caption)",
                    }}
                  >
                    {list.activeTaskCount}
                  </span>
                )}

                <button
                  type="button"
                  data-testid="list-menu-trigger"
                  aria-label={`List actions: ${list.name}`}
                  aria-expanded={openMenu === list.id}
                  onClick={() =>
                    setOpenMenu(openMenu === list.id ? null : list.id)
                  }
                  style={iconButton}
                >
                  ⋯
                </button>
              </div>

              {openMenu === list.id && (
                <div
                  role="menu"
                  data-testid="list-menu"
                  style={{
                    position: "absolute",
                    right: 0,
                    zIndex: 5,
                    minWidth: 160,
                    padding: "var(--space-1)",
                    background: "var(--color-surface)",
                    border:
                      "var(--border-width-hairline) solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "var(--shadow-md)",
                  }}
                >
                  <MenuItem
                    testId="menu-rename"
                    label="Rename"
                    onClick={() => {
                      setOpenMenu(null);
                      setDialog({ kind: "rename", list });
                    }}
                  />
                  <MenuItem
                    testId="menu-move-up"
                    label="Move up"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  />
                  <MenuItem
                    testId="menu-move-down"
                    label="Move down"
                    disabled={index === lists.length - 1}
                    onClick={() => void move(index, 1)}
                  />
                  {/* The Inbox can never be deleted (FR-LIST-004), so it gets no
                      Delete item at all rather than a disabled one (D1). */}
                  {!list.isDefault && (
                    <MenuItem
                      testId="menu-delete"
                      label="Delete"
                      danger
                      onClick={() => {
                        setOpenMenu(null);
                        onNavigate?.();
                        setDialog({ kind: "delete", list });
                      }}
                    />
                  )}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}

      {reorderError && (
        <p
          role="alert"
          data-testid="reorder-error"
          style={{
            margin: "var(--space-2) 0 0",
            paddingLeft: "var(--space-3)",
            fontSize: "var(--font-size-small)",
            color: "var(--color-danger)",
          }}
        >
          {reorderError}
        </p>
      )}

      {dialog && (
        <ListDialog
          mode={dialog}
          onClose={() => setDialog(null)}
          onDone={afterMutation}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="list-toast"
          style={{
            position: "fixed",
            bottom: "var(--space-6)",
            right: "var(--space-6)",
            zIndex: 60,
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-surface)",
            border: "var(--border-width-hairline) solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-small)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  testId,
  disabled = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        minHeight: 44,
        padding: "0 var(--space-3)",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: "transparent",
        color: danger ? "var(--color-danger)" : "var(--color-text)",
        fontSize: "var(--font-size-body)",
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

// DEF-011: design.md §4's `icon-button` is "40px (44px TOUCH) square" and §5
// requires >= 44x44 on touch viewports; with no coarse-pointer rule in the app
// the control is one size everywhere, so that size must be the touch one.
// Guarded by `e2e/tests/touch-target.spec.ts`.
const iconButton = {
  minWidth: "var(--size-touch-target)",
  minHeight: "var(--size-touch-target)",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "transparent",
  color: "var(--color-text-muted)",
  fontSize: "var(--font-size-body-lg)",
  lineHeight: 1,
  cursor: "pointer",
};
