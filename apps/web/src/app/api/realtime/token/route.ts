import { NextRequest, NextResponse } from "next/server";
import { REALTIME_TOKEN_PATH } from "@todo/shared";

// BFF proxy for the Realtime token (ADR-002; FEAT-019 technical-design §3.1).
// Cookie forwarded so the API's SessionGuard resolves the caller; status + JSON
// relayed verbatim, including the 401 that means "your session is gone" and the
// `{ enabled: false }` that means "no provider configured" — which is a normal
// answer, not an error, and the client falls back on it.
//
// The browser never learns the API's address, and never holds anything but the
// publishable key and its own short-lived token (AC-8).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}${REALTIME_TOKEN_PATH}`, {
    headers: cookie ? { cookie } : {},
    cache: "no-store",
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
