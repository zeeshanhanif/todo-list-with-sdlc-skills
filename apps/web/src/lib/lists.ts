import { cookies } from "next/headers";
import {
  LISTS_PATH,
  SESSION_COOKIE,
  type ListSummary,
  type ListsResponse,
} from "@todo/shared";

// Server-side list fetch for the app shell's sidebar (FEAT-009 ui-design
// SCR-WEB-007). The shell is a server component, so the lists arrive with the
// first paint rather than after a client round-trip — there is no loading
// flash in the common path. Mirrors lib/session.ts's shape.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** The caller's lists in their persisted order, or null when the request failed
 * (the sidebar renders its error state — it never strands the frame). */
export async function fetchLists(): Promise<ListSummary[] | null> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  try {
    const res = await fetch(`${API_URL}${LISTS_PATH}`, {
      headers: { cookie: `${SESSION_COOKIE}=${sid}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return ((await res.json()) as ListsResponse).lists;
  } catch {
    return null;
  }
}
