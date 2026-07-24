import { NextRequest, NextResponse } from "next/server";

// BFF proxy (ADR-002): forwards POST /auth/verify/resend to the NestJS API
// server-side. The API responds neutrally (always 200, no enumeration —
// FEAT-002 technical-design D3); this relays it verbatim. (FEAT-002.)
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const res = await fetch(`${API_URL}/auth/verify/resend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
