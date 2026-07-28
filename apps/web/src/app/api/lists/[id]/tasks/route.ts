import { NextRequest, NextResponse } from "next/server";
import { listTasksPath } from "@todo/shared";

// BFF proxy for a list's tasks (ADR-002; FEAT-010 technical-design §5): GET is
// the list view (FR-TASK-003), POST is the quick-add composer's target
// (FR-TASK-001). Cookie forwarded so the API's SessionGuard resolves the caller;
// status + JSON relayed verbatim, including 404 list_not_found (unknown or not
// owned — the API never distinguishes them, FR-AUTHZ-003) and 400
// validation_failed on the title field.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  return proxy(req, "GET", id);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  return proxy(req, "POST", id, await req.text());
}

async function proxy(
  req: NextRequest,
  method: string,
  listId: string,
  body?: string,
): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(
    `${API_URL}${listTasksPath(encodeURIComponent(listId))}`,
    {
      method,
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body }),
      cache: "no-store",
    },
  );
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
