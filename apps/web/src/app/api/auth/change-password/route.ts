import { NextRequest, NextResponse } from "next/server";

// BFF proxy for change-password (ADR-002; FEAT-006 technical-design §5). Unlike
// the other auth proxies it does BOTH halves: it forwards the browser's session
// cookie so the API's SessionGuard can resolve the caller (like the session
// proxy), and relays the API's Set-Cookie back so the rotated session lands on
// the web origin (like the login proxy — FEAT-006 D1). The client IP is
// forwarded for the per-IP limiter + audit. Status + JSON envelope are relayed
// verbatim (200 password_changed; 400 current_password_invalid/validation_failed;
// 401 unauthenticated; 429 rate_limited).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const cookie = req.headers.get("cookie");
  const xff = req.headers.get("x-forwarded-for");
  const res = await fetch(`${API_URL}/auth/change-password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(xff ? { "x-forwarded-for": xff } : {}),
    },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  const out = new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    out.headers.set("set-cookie", setCookie);
  }
  return out;
}
