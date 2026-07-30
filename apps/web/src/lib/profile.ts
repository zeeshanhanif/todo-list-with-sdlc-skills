import { cookies } from "next/headers";
import {
  PROFILE_PATH,
  SESSION_COOKIE,
  type ProfileResponse,
  type UserProfile,
} from "@todo/shared";

// Server-side profile fetch for the app shell (FEAT-008 technical-design §5.2).
// The shell is a server component, so the caller's timezone and theme arrive
// with the first paint rather than after a client round-trip. Mirrors
// lib/lists.ts's shape exactly — including the null-on-failure contract, which
// is what lets the shell degrade instead of stranding (NFR-REL-004).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** The caller's profile, or null when the request failed or there is no session. */
export async function fetchProfile(): Promise<UserProfile | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  try {
    const res = await fetch(`${API_URL}${PROFILE_PATH}`, {
      headers: { cookie: `${SESSION_COOKIE}=${sid}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return ((await res.json()) as ProfileResponse).profile;
  } catch {
    return null;
  }
}
