import { NextRequest, NextResponse } from "next/server";

// BFF proxy (ADR-002; FEAT-005). Forwards POST /auth/reset to the API server-side
// and forwards the client IP for per-IP rate-limiting. Relays status + JSON
// envelope verbatim (200 password_reset; 400 token_expired/token_invalid/
// validation_failed; 429 rate_limited).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const xff = req.headers.get("x-forwarded-for");
  const res = await fetch(`${API_URL}/auth/reset`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(xff ? { "x-forwarded-for": xff } : {}) },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
