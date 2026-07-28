import { NextRequest, NextResponse } from "next/server";
import { taskPath } from "@todo/shared";

// BFF proxy for the single-task resource (ADR-002; FEAT-011 technical-design §5):
// GET is the detail view (FR-TASK-004), PATCH is every edit (FR-TASK-005/006/008).
// Cookie forwarded so the API's SessionGuard resolves the caller; status + JSON
// relayed verbatim, including 404 task_not_found (unknown, not owned, malformed
// or soft-deleted — the API never distinguishes them, FR-AUTHZ-003) and 400
// validation_failed naming title / dueAt / priority.
//
// The body is relayed as raw text rather than parsed and re-serialized, so an
// explicit `"dueAt": null` — FR-TASK-006's *clear* — reaches the API exactly as
// the browser sent it, and is never collapsed into an absent field on the way.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  return proxy(req, "GET", id);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  return proxy(req, "PATCH", id, await req.text());
}

async function proxy(
  req: NextRequest,
  method: string,
  id: string,
  body?: string,
): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}${taskPath(encodeURIComponent(id))}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body }),
    cache: "no-store",
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
