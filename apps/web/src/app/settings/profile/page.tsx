import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SettingsNav } from "@/components/settings-nav";
import { ProfileForm } from "@/components/profile-form";
import { requireSession } from "@/lib/session";
import { fetchProfile } from "@/lib/profile";

// SCR-WEB-013 — Settings › Profile & Preferences (ui-design.md). The account's
// display name, timezone and theme (FR-PROF-001..005, UC-007). Server component:
// it resolves the session and the profile before the first paint, then hands the
// values to the form island. An unresolved session redirects to /signin
// server-side (the guarded-zone convention FEAT-006 D4 established).
export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  await requireSession();
  const profile = await fetchProfile();
  // The session resolved but the profile did not: the API is the same origin of
  // truth for both, so this is the session going away between the two calls
  // rather than a state worth rendering an error for.
  if (!profile) redirect("/signin");

  return (
    <AppShell active="settings">
      <SettingsNav active="profile" />
      <h1
        style={{
          fontSize: "var(--font-size-h1)",
          lineHeight: "var(--font-line-height-h1)",
          color: "var(--color-text)",
          margin: "0 0 var(--space-2)",
        }}
      >
        Profile &amp; preferences
      </h1>
      <p
        style={{
          margin: "0 0 var(--space-6)",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-body)",
        }}
      >
        These settings follow your account across every device.
      </p>

      <ProfileForm profile={profile} />
    </AppShell>
  );
}
