import { NextRequest, NextResponse } from "next/server";

// BFF proxy for session introspection (ADR-002; FEAT-003 technical-design D6).
// Forwards GET /auth/session to the API, passing the browser's session cookie
// through so the API's SessionGuard can resolve it. Relays status + JSON verbatim
// (200 { user } when authenticated, 401 unauthenticated otherwise).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}/auth/session`, {
    method: "GET",
    headers: { ...(cookie ? { cookie } : {}) },
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
