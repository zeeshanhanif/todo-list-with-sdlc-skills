import { fetchSkeletonPing } from "@/lib/api";

// The skeleton shell: the app-shell frame (SCR-WEB-007 — sidebar + content) with
// the design system wired in, plus a card proving the end-to-end path
// (web -> API /skeleton/ping -> Postgres write+read -> back). Feature screens
// replace the content column per slice. All colors/spacing come from token CSS
// variables, so this visibly breaks if docs/tokens.json is removed.
export const dynamic = "force-dynamic";

export default async function Home() {
  const health = await fetchSkeletonPing();
  const healthy = health?.status === "ok" && health?.db === "up";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: "var(--size-sidebar-width)",
          background: "var(--color-surface)",
          borderRight: "var(--border-width-hairline) solid var(--color-border)",
          padding: "var(--space-6)",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            color: "var(--color-primary)",
            fontWeight: "var(--font-weight-semibold)" as unknown as number,
            fontSize: "var(--font-size-body-lg)",
          }}
        >
          To-Do
        </div>
        <nav
          style={{
            marginTop: "var(--space-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            color: "var(--color-text-muted)",
          }}
        >
          <span>Today</span>
          <span>Upcoming</span>
          <span>Overdue</span>
          <span>Inbox</span>
        </nav>
        <p
          style={{
            marginTop: "var(--space-8)",
            fontSize: "var(--font-size-caption)",
            lineHeight: "var(--font-line-height-caption)",
            color: "var(--color-text-subtle)",
          }}
        >
          App shell (SCR-WEB-007). Feature screens land here per slice.
        </p>
      </aside>

      <main style={{ flex: 1, padding: "var(--space-8)" }}>
        <div style={{ maxWidth: "var(--size-content-max)", margin: "0 auto" }}>
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
        </div>
      </main>
    </div>
  );
}
