import type { SmartView, SmartViewResponse } from "@todo/shared";

// The browser half of the smart-view fetches (FEAT-016 technical-design §5.4):
// "Load more", and nothing else — the first page is server-rendered by
// lib/views.ts, which imports `next/headers` and therefore cannot be reached
// from a client component. The same split lib/search.ts (client) and
// lib/lists.ts (server) already have.

/** A discriminated result, so the screen renders its failure from a value
 * rather than from a thrown exception it would have to catch. */
export type LoadMoreOutcome =
  | { kind: "ok"; data: SmartViewResponse }
  | { kind: "unauthenticated" }
  | { kind: "error" };

/** The next page, by the cursor the previous one returned. The cursor is passed
 * back untouched — it is opaque by contract (FEAT-015 D4). */
export async function loadMoreView(
  view: SmartView,
  cursor: string,
): Promise<LoadMoreOutcome> {
  try {
    const res = await fetch(
      `/api/views/${view}?cursor=${encodeURIComponent(cursor)}`,
      { cache: "no-store" },
    );
    if (res.status === 200) {
      return { kind: "ok", data: (await res.json()) as SmartViewResponse };
    }
    if (res.status === 401) return { kind: "unauthenticated" };
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
