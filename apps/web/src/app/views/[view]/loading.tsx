// SCR-WEB-009's `loading` state (FEAT-016 ui-design D4) — design.md §4's
// "Loading: skeleton rows (not a blank screen)" convention, rendered for the
// first time in this product. Next's streaming fallback for the page, nested
// inside the view layout, so the shell and its sidebar stay on screen.
//
// **Static, with no shimmer**: design.md §5 forbids conveying information by
// motion alone, and a placeholder that does not animate satisfies
// prefers-reduced-motion by construction rather than by a media query.
//
// The rows match the real ones' rhythm — --size-touch-target tall, the same
// hairline separator — so the swap does not jump.
// All values are design tokens.
export default function Loading() {
  return (
    <div data-testid="view-loading" aria-busy="true">
      <div
        style={{
          width: "8rem",
          height: "var(--font-size-h1)",
          marginBottom: "var(--space-5)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface-sunken)",
        }}
      />
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <li
            key={row}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              minHeight: "var(--size-touch-target)",
              padding: "var(--space-2) var(--space-3)",
              borderBottom:
                "var(--border-width-hairline) solid var(--color-border)",
            }}
          >
            <span
              style={{
                flex: "none",
                width: "var(--space-5)",
                height: "var(--space-5)",
                borderRadius: "var(--radius-full)",
                background: "var(--color-surface-sunken)",
              }}
            />
            <span
              style={{
                // Uneven widths, so it reads as content rather than as a table.
                flex: `0 1 ${["60%", "45%", "70%", "50%", "65%", "40%"][row]}`,
                height: "var(--font-size-body)",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-surface-sunken)",
              }}
            />
          </li>
        ))}
      </ul>
      {/* The one thing a static skeleton cannot say on its own — announced
          politely so it is not read over whatever the user was doing. */}
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        Loading tasks…
      </span>
    </div>
  );
}
