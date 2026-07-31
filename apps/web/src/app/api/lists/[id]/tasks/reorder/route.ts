import { NextRequest, NextResponse } from "next/server";
import { reorderTasksPath } from "@todo/shared";

// BFF proxy for the task reorder endpoint (ADR-002; FEAT-014 technical-design
// §3.3). Body is the caller's complete set of ACTIVE task ids in the desired
// order (D2); cookie forwarded so the API's SessionGuard resolves the caller;
// status + JSON relayed verbatim — 200 with the full list view, 400
// validation_failed on `taskIds` (including the stale-vector case the client
// treats as "refresh and roll back"), 404 list_not_found, 401 unauthenticated.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const cookie = req.headers.get("cookie");
  const res = await fetch(
    `${API_URL}${reorderTasksPath(encodeURIComponent(id))}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: await req.text(),
      cache: "no-store",
    },
  );
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
