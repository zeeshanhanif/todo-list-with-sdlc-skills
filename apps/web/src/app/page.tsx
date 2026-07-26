import { fetchSkeletonPing } from "@/lib/api";
import { AppShell } from "@/components/app-shell";

// The skeleton content column inside the app-shell frame (SCR-WEB-007 — the frame
// itself now lives in components/app-shell.tsx, shared with the settings screens
// FEAT-006 added): a card proving the end-to-end path (web -> API /skeleton/ping
// -> Postgres write+read -> back). Feature screens replace this column per slice.
// All colors/spacing come from token CSS variables, so this visibly breaks if
// docs/tokens.json is removed.
export const dynamic = "force-dynamic";

export default async function Home() {
  const health = await fetchSkeletonPing();
  const healthy = health?.status === "ok" && health?.db === "up";

  return (
    <AppShell>
      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          lineHeight: "var(--font-line-height-h1)",
          color: "var(--color-text)",
          marginBottom: "var(--space-4)",
        }}
      >
        Walking skeleton
      </h1>

      <section
        data-testid="health-card"
        style={{
          background: "var(--color-surface)",
          border: "var(--border-width-hairline) solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "var(--space-6)",
        }}
      >
        <span
          data-testid="overall-status"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-1) var(--space-3)",
            borderRadius: "var(--radius-full)",
            background: healthy
              ? "var(--color-success-subtle)"
              : "var(--color-danger-subtle)",
            color: healthy
              ? "var(--color-success-text)"
              : "var(--color-danger)",
            fontSize: "var(--font-size-small)",
          }}
        >
          {healthy ? "healthy" : "degraded"}
        </span>

        <dl
          style={{
            marginTop: "var(--space-4)",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "var(--space-2) var(--space-4)",
            color: "var(--color-text)",
          }}
        >
          <dt style={{ color: "var(--color-text-muted)" }}>API</dt>
          <dd data-testid="api-status">{health?.status ?? "unreachable"}</dd>
          <dt style={{ color: "var(--color-text-muted)" }}>Database</dt>
          <dd data-testid="db-status">{health?.db ?? "unknown"}</dd>
          <dt style={{ color: "var(--color-text-muted)" }}>Pings recorded</dt>
          <dd>{health?.pingCount ?? "—"}</dd>
        </dl>
      </section>
    </AppShell>
  );
}
