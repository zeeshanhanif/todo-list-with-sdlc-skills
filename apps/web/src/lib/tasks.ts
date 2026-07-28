import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  listTasksPath,
  taskPath,
  type ListTasksResponse,
  type TaskDetailResponse,
} from "@todo/shared";

// Server-side list-view fetch (FEAT-010 ui-design SCR-WEB-008). The screen is a
// server component, so the tasks arrive with the first paint — no loading flash
// in the common path, the same shape lib/lists.ts uses.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

/** What the list-view page needs: the data, or which failure to render.
 * `not-found` is the uniform answer for an unknown **or** unowned list — the
 * screen must not distinguish them (FR-AUTHZ-003). */
export type ListViewResult =
  | { kind: "ok"; data: ListTasksResponse }
  | { kind: "not-found" }
  | { kind: "unauthenticated" }
  | { kind: "error" };

export async function fetchListTasks(listId: string): Promise<ListViewResult> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return { kind: "unauthenticated" };
  try {
    const res = await fetch(`${API_URL}${listTasksPath(listId)}`, {
      headers: { cookie: `${SESSION_COOKIE}=${sid}` },
      cache: "no-store",
    });
    if (res.status === 404) return { kind: "not-found" };
    if (res.status === 401) return { kind: "unauthenticated" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", data: (await res.json()) as ListTasksResponse };
  } catch {
    return { kind: "error" };
  }
}

/** What the task-detail surface needs: the data, or which failure to render
 * (SCR-WEB-010, FEAT-011). Same discriminated shape as ListViewResult, so both
 * screens branch identically — `not-found` is the uniform answer for an id that
 * is unknown, unowned OR soft-deleted, and the screen must not distinguish them
 * (FR-AUTHZ-003). */
export type TaskDetailResult =
  | { kind: "ok"; data: TaskDetailResponse }
  | { kind: "not-found" }
  | { kind: "unauthenticated" }
  | { kind: "error" };

export async function fetchTask(id: string): Promise<TaskDetailResult> {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value;
  if (!sid) return { kind: "unauthenticated" };
  try {
    const res = await fetch(`${API_URL}${taskPath(encodeURIComponent(id))}`, {
      headers: { cookie: `${SESSION_COOKIE}=${sid}` },
      cache: "no-store",
    });
    if (res.status === 404) return { kind: "not-found" };
    if (res.status === 401) return { kind: "unauthenticated" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", data: (await res.json()) as TaskDetailResponse };
  } catch {
    return { kind: "error" };
  }
}
