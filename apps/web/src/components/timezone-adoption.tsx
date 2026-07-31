"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { UserProfile } from "@todo/shared";

// FR-PROF-003's first half: "Defaults to the browser-detected timezone at first
// sign-in; falls back to UTC" (FEAT-008 technical-design §5.2, AC-7).
//
// Two defaults for two different moments, which is why the column is nullable
// (D2): `null` means "not yet established", the server falls back to UTC for
// anything it computes, and the *browser* — the only party that knows where the
// user is — establishes the real value once. That adoption cannot live in the
// sign-in endpoint, because the API never sees a browser's zone.
//
// Renders nothing. Mounted in the authenticated shell beside ThemeSync.
export function TimezoneAdoption({ profile }: { profile: UserProfile | null }) {
  const router = useRouter();
  // React may run an effect twice in development's strict mode, and the shell
  // re-renders on every navigation; the adoption must be ONE request either way
  // (AC-7 asserts exactly that).
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    // Already established, or no profile to establish it on.
    if (!profile || profile.timezone !== null) return;

    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // A runtime that cannot name its own zone leaves the account on the UTC
    // fallback rather than guessing — the user can still choose one by hand.
    if (!detected) return;

    attempted.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ timezone: detected }),
        });
        // Silent by design: this is an inference the user never asked for, so a
        // failure must not produce an error message about a setting they have
        // not visited. They keep UTC, and the settings screen still works.
        if (res.ok) router.refresh();
      } catch {
        // Same reasoning — degrade to the UTC fallback (NFR-REL-004).
      }
    })();
  }, [profile, router]);

  return null;
}
