import { NextRequest, NextResponse } from "next/server";

// BFF proxy for sign-out (ADR-002; FEAT-004 technical-design §2). Forwards
// POST /auth/logout to the NestJS API server-side, passing the browser's session
// cookie so the API can revoke the matching session, and relays the API's
// cookie-clearing Set-Cookie back to the browser. Idempotent — always 200.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: { ...(cookie ? { cookie } : {}) },
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
