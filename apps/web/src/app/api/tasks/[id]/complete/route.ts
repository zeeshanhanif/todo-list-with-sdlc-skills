import { NextRequest, NextResponse } from "next/server";
import { completeTaskPath } from "@todo/shared";

// BFF proxy for the complete transition (ADR-002; FEAT-012 technical-design §3.1).
// Cookie forwarded so the API's SessionGuard resolves the caller; status + JSON
// relayed verbatim, including 404 task_not_found (unknown, not owned, malformed
// or soft-deleted — the API never distinguishes them, FR-AUTHZ-003).
//
// **No body is sent, because the route takes none** (design D8): the completion
// instant is the server's, and there is nothing for the client to say. That is
// also why there is no `req.text()` here, unlike the PATCH proxy next door.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const cookie = req.headers.get("cookie");
  const res = await fetch(
    `${API_URL}${completeTaskPath(encodeURIComponent(id))}`,
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
