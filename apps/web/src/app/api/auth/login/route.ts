import { NextRequest, NextResponse } from "next/server";

// BFF proxy for sign-in (ADR-002; FEAT-003 technical-design D6). Forwards
// POST /auth/login to the NestJS API server-side and — unlike the other auth
// proxies — relays the API's Set-Cookie back to the browser so the opaque
// session cookie is set on the web origin. Also forwards the client IP so the
// API's per-IP rate-limit + audit see the real caller, not the web server.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const xff = req.headers.get("x-forwarded-for");
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
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
