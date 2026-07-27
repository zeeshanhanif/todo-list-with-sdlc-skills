import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

// The authenticated app home (SCR-WEB-007) — where sign-in lands. FEAT-009
// replaced the walking-skeleton health card here (technical-design D7): the
// sidebar is now the product's primary navigation, carrying the user's real
// lists with their active-task counts.
//
// The content column below is an INTERIM placeholder, deliberately not a
// designed screen: SCR-WEB-008 (List View) and SCR-WEB-018 (first-run) belong to
// FEAT-010, which replaces this. Sidebar rows are correspondingly not
// navigational yet — there is no /lists/{id} route to reach.
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireSession();

  return (
    <AppShell>
      <section
        data-testid="home-placeholder"
        style={{
          background: "var(--color-surface)",
          border: "var(--border-width-hairline) solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-8)",
          textAlign: "center",
          color: "var(--color-text-muted)",
        }}
      >
        <h1
          style={{
            margin: `0 0 var(--space-2)`,
            fontSize: "var(--font-size-h2)",
            color: "var(--color-text)",
          }}
        >
          Your lists are in the sidebar
        </h1>
        <p style={{ margin: 0, fontSize: "var(--font-size-body)" }}>
          Pick a list to see its tasks — coming with the next slice.
        </p>
      </section>
    </AppShell>
  );
}
