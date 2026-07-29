import { NextRequest, NextResponse } from "next/server";
import { reopenTaskPath } from "@todo/shared";

// BFF proxy for the reopen transition (ADR-002; FEAT-012 technical-design §3.2).
// The mirror of ../complete/route.ts — same forwarding, same verbatim relay, no
// body (design D8). Kept as its own file rather than a `[action]` segment: two
// named routes are greppable and cannot be called with an action the API does
// not have.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const cookie = req.headers.get("cookie");
  const res = await fetch(
    `${API_URL}${reopenTaskPath(encodeURIComponent(id))}`,
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
