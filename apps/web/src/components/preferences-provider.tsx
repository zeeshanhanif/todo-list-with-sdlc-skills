"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UserProfile } from "@todo/shared";

// The authenticated zone's preference context (FEAT-008 technical-design §5.2).
//
// Why a context rather than props: the user's timezone is needed by leaves that
// sit several server components deep — `list-view` → `TaskRow` → `DueChip` — and
// by client islands the server cannot reach at all (`quick-add`,
// `task-detail`). One provider in the shell beats threading a string through
// every intermediate component, and it means a preference change re-renders
// every consumer at once (ui-design D9, UC-007 alt 4a).
//
// Populated server-side by app-shell.tsx, so it is correct on the first paint.

/** `null` when the profile fetch failed — consumers fall back rather than break. */
const PreferencesContext = createContext<UserProfile | null>(null);

export function PreferencesProvider({
  profile,
  children,
}: {
  profile: UserProfile | null;
  children: ReactNode;
}) {
  return (
    <PreferencesContext.Provider value={profile}>
      {children}
    </PreferencesContext.Provider>
  );
}

/** The stored profile, or null outside the authenticated zone / on a failed fetch. */
export function usePreferences(): UserProfile | null {
  return useContext(PreferencesContext);
}

/**
 * The **effective** timezone: the stored zone, or `UTC` when none is established
 * yet (technical-design D2 — the fallback is computed, never stored) or when the
 * profile could not be fetched (NFR-REL-004: a degraded shell still renders dates,
 * it just renders them in UTC).
 */
export function useTimeZone(): string {
  return usePreferences()?.timezone ?? "UTC";
}
