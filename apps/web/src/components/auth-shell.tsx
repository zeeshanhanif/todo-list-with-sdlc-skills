import type { ReactNode } from "react";

// Shared auth-zone layout (ui-design.md): centered 400px card on the canvas with
// the "To-Do" wordmark above. No app-shell/sidebar. All values are design tokens.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
        background: "var(--color-background)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div
          style={{
            textAlign: "center",
            marginBottom: "var(--space-4)",
            color: "var(--color-primary)",
            fontSize: "var(--font-size-h3)",
            fontWeight: "var(--font-weight-semibold)" as unknown as number,
          }}
        >
          To-Do
        </div>
        <div
          style={{
            background: "var(--color-surface)",
            border: "var(--border-width-hairline) solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            padding: "var(--space-6)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
