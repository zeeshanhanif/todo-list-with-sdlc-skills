import { NextRequest, NextResponse } from "next/server";
import { SEARCH_PATH } from "@todo/shared";

// BFF proxy for search (ADR-002; FEAT-015 technical-design §5.3). Forwards the
// browser's session cookie so the API's SessionGuard can resolve the caller,
// and relays status + JSON envelope verbatim (200 results / 400
// validation_failed / 401 unauthenticated).
//
// The query string is forwarded WHOLE rather than reassembled: the cursor is
// opaque by contract (technical-design D4), so a proxy that picked apart and
// rebuilt the parameters would be the one place that had to understand it.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}${SEARCH_PATH}${req.nextUrl.search}`, {
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    cache: "no-store",
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
