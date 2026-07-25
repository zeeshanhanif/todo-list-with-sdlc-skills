import { NextRequest, NextResponse } from "next/server";

// BFF proxy (ADR-002 — web is light BFF glue): forwards POST /auth/verify to the
// NestJS API server-side, so the browser calls same-origin and the API URL stays
// server-only. Relays the API's status + JSON envelope verbatim. Mirrors the
// register proxy. (FEAT-002 SCR-WEB-003.)
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const res = await fetch(`${API_URL}/auth/verify`, {
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
