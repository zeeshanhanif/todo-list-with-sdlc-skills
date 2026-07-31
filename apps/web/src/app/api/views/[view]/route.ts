import { NextRequest, NextResponse } from "next/server";
import { smartViewPath } from "@todo/shared";

// BFF proxy for one smart view (ADR-002; FEAT-016 technical-design §5.4).
// Forwards the browser's session cookie so the API's SessionGuard can resolve
// the caller, and relays status + JSON envelope verbatim (200 page / 400
// validation_failed / 401 unauthenticated / 404 view_not_found).
//
// Only "Load more" reaches this route: the FIRST page is server-rendered by
// app/views/[view]/page.tsx, so a cold visit paints with its tasks already in
// place (ui-design D5's consequence).
//
// The query string is forwarded WHOLE rather than reassembled: the cursor is
// opaque by contract (FEAT-015 D4), so a proxy that picked apart and rebuilt the
// parameters would be the one place that had to understand it.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ view: string }> },
): Promise<NextResponse> {
  const { view } = await ctx.params;
  const cookie = req.headers.get("cookie");
  const res = await fetch(
    `${API_URL}${smartViewPath(encodeURIComponent(view))}${req.nextUrl.search}`,
    {
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      cache: "no-store",
    },
  );
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
