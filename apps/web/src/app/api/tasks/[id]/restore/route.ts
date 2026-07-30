import { NextRequest, NextResponse } from "next/server";
import { restoreTaskPath } from "@todo/shared";

// BFF proxy for the undo (ADR-002; FEAT-013 technical-design §3.2). Cookie
// forwarded so the API's SessionGuard resolves the caller; status + JSON
// relayed verbatim, including 404 task_not_found — which here means the row is
// gone for good (purged by FEAT-020) or was never the caller's, and the API
// never distinguishes them (FR-AUTHZ-003).
//
// No body, because the route takes none: method, path and session fully
// specify the operation, exactly like ../complete and ../reopen next door.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const cookie = req.headers.get("cookie");
  const res = await fetch(
    `${API_URL}${restoreTaskPath(encodeURIComponent(id))}`,
    {
      method: "POST",
      headers: cookie ? { cookie } : {},
      cache: "no-store",
    },
  );
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
