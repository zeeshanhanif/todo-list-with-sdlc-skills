import type {
  ApiError,
  SearchDueBucket,
  SearchResponse,
  SearchStatus,
} from "@todo/shared";

// Client-side search fetch (FEAT-015 technical-design §5.3). Client, not server:
// SCR-WEB-012 is an overlay driven by typing, so its requests come from the
// browser as the user types — there is no server render to hang them off.

export interface SearchParams {
  q?: string;
  status?: SearchStatus | "";
  due?: SearchDueBucket | "";
  cursor?: string;
  limit?: number;
}

/** A discriminated result, so the overlay renders its error state from a value
 * rather than from a thrown exception it would have to catch in three places. */
export type SearchOutcome =
  | { kind: "ok"; data: SearchResponse }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

/**
 * Build the query string, dropping every empty criterion.
 *
 * The UI's "Any" option is the *absence* of a filter (ui-design D3), so it must
 * not be sent as an empty value — `status=` is a validation error, while an
 * omitted `status` is simply no status filter. Exported for the tests that pin
 * exactly that.
 */
export function buildSearchQuery(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.status) qs.set("status", params.status);
  if (params.due) qs.set("due", params.due);
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  return qs.toString();
}

/** True when there is a question to ask — the client half of technical-design
 * D6. The overlay stays idle rather than sending a request the API would (and
 * should) reject. */
export function hasCriteria(params: SearchParams): boolean {
  return Boolean(params.q?.trim() || params.status || params.due);
}

export async function searchTasks(
  params: SearchParams,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  try {
    const res = await fetch(`/api/search?${buildSearchQuery(params)}`, {
      signal,
    });
    if (res.status === 200) {
      return { kind: "ok", data: (await res.json()) as SearchResponse };
    }
    if (res.status === 401) {
      return { kind: "unauthenticated" };
    }
    const body = (await res.json()) as ApiError;
    return {
      kind: "error",
      message:
        body.fields?.[0]?.message ??
        body.message ??
        "Something went wrong. Please try again.",
    };
  } catch (err) {
    // An aborted request is not a failure — it is the previous keystroke's
    // search being discarded (ui-design D5). Surfacing it as an error would
    // flash a message on every character typed.
    if (err instanceof DOMException && err.name === "AbortError") {
      return { kind: "error", message: "" };
    }
    return { kind: "error", message: "Something went wrong. Please try again." };
  }
}
