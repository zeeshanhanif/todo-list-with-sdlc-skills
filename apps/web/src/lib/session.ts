import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_PATH, type SessionResponse, type SessionUser } from "@todo/shared";

// Server-side session gate for the authenticated zone (FEAT-006 ui-design D4).
// A screen inside the app shell resolves the session on the server and redirects
// to /signin when the API answers 401 — a 401 in this zone always means "your
// session is gone", never an inline error.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** Resolve the current session server-side, or null when unauthenticated. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  try {
    const res = await fetch(`${API_URL}${SESSION_PATH}`, {
      headers: { cookie: `${SESSION_COOKIE}=${sid}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return ((await res.json()) as SessionResponse).user;
  } catch {
    return null;
  }
}

/** Same, but redirects to the sign-in screen (SCR-WEB-004) instead of returning null. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/signin");
  return user;
}
