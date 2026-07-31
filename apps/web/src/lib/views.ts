import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SMART_VIEWS,
  smartViewPath,
  type SmartView,
  type SmartViewResponse,
} from "@todo/shared";

// Smart-view fetch for SCR-WEB-009's first page (FEAT-016 technical-design
// §5.4) — server-side, so the screen paints with its tasks, the shape
// lib/tasks.ts uses for SCR-WEB-008.
//
// **Server half only.** "Load more" runs in the browser and lives in
// lib/views-client.ts: a module that imports `next/headers` cannot be pulled
// into a client component, and one file serving both sides drags this one
// there through the import graph. Same split lib/lists.ts (server) and
// lib/search.ts (client) already have.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** What the smart-view page needs: the data, or which failure to render.
 * `not-found` is the answer for a view name outside the four — a URL typo, not
 * an ownership question (technical-design D6). Same discriminated shape as
 * `ListViewResult`, so both screens branch identically. */
export type SmartViewResult =
  | { kind: "ok"; data: SmartViewResponse }
  | { kind: "not-found" }
  | { kind: "unauthenticated" }
  | { kind: "error" };

/** Narrow a URL segment to a view name without a request — the sidebar's
 * selected state and the heading both need it before any fetch resolves. */
export function asSmartView(view: string): SmartView | null {
  return (SMART_VIEWS as readonly string[]).includes(view)
    ? (view as SmartView)
    : null;
}

export async function fetchSmartView(view: string): Promise<SmartViewResult> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return { kind: "unauthenticated" };
  try {
    const res = await fetch(
      `${API_URL}${smartViewPath(encodeURIComponent(view))}`,
      {
        headers: { cookie: `${SESSION_COOKIE}=${sid}` },
        cache: "no-store",
      },
    );
    if (res.status === 404) return { kind: "not-found" };
    if (res.status === 401) return { kind: "unauthenticated" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", data: (await res.json()) as SmartViewResponse };
  } catch {
    return { kind: "error" };
  }
}
