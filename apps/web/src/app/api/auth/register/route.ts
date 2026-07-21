import { NextRequest, NextResponse } from "next/server";

// BFF proxy (ADR-002 — web is light BFF glue): forwards the registration request
// to the NestJS API server-side, so the browser calls same-origin (no CORS) and
// the API URL stays server-only. Relays the API's status + JSON envelope verbatim.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const res = await fetch(`${API_URL}/auth/register`, {
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
