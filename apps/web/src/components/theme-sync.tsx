"use client";

import { useEffect } from "react";
import type { ThemePreference } from "@todo/shared";

// Theme application (FEAT-008 technical-design D3; FR-PROF-004 "applied on load",
// "persisted server-side so it follows the user across devices").
//
// The division of labour, and why it is split at all:
//   - The **database row** is the truth, and it is what follows the user across
//     devices. Nothing here changes that.
//   - The **cookie** is a per-device render cache, and exists for one reason:
//     the root layout's inline script must decide the theme BEFORE first paint,
//     and it cannot wait for an API call. A dark-theme user who saw a white
//     flash on every navigation would be looking at a defect (AC-11).
//   - This component reconciles the two: once the shell renders with the
//     server-fetched profile, it applies the authoritative value and rewrites
//     the mirror for next time.
//
// `system` is stored as a preference, not a resolved value, so resolving it is
// this layer's job — per device, and live: an OS theme change while the app is
// open moves the UI with it.

export const THEME_COOKIE = "theme";

/** Resolve a stored preference to the attribute value `:root` actually carries. */
export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** design.md §8: "toggle `data-theme="dark"` on `:root`; all tokens re-value." */
export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolveTheme(preference);
}

/** Mirror the preference for the next load's pre-paint script (D3). Not
 * HttpOnly by necessity — a script the browser runs has to be able to read it —
 * and it carries nothing sensitive: it is a colour scheme. */
export function writeThemeCookie(preference: ThemePreference): void {
  document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=31536000; samesite=lax`;
}

/** Clear the mirror. The preference belongs to the ACCOUNT, so it must not
 * outlive the session on a shared browser (D3 consequence). */
export function clearThemeCookie(): void {
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Renders nothing. Mounted in the authenticated shell, where the server-fetched
 * profile is available.
 */
export function ThemeSync({ theme }: { theme: ThemePreference | null }) {
  useEffect(() => {
    // A failed profile fetch leaves the pre-paint script's guess in place rather
    // than overwriting it with a value we do not have (NFR-REL-004).
    if (theme === null) return;

    applyTheme(theme);
    writeThemeCookie(theme);

    // Only `system` follows the OS, and only while it is selected — an explicit
    // light/dark choice must survive the user's OS switching at dusk.
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}
