import { NextRequest, NextResponse } from "next/server";
import { PROFILE_PATH } from "@todo/shared";

// BFF proxy for the profile resource (ADR-002; FEAT-008 technical-design §5.2).
// Forwards the browser's session cookie so the API's SessionGuard can resolve the
// caller, and relays status + JSON envelope verbatim (200 profile / 400
// validation_failed / 401 unauthenticated). No Set-Cookie relay is needed — the
// profile endpoints never rotate the session.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return proxy(req, "GET");
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  return proxy(req, "PATCH", await req.text());
}

async function proxy(
  req: NextRequest,
  method: string,
  body?: string,
): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}${PROFILE_PATH}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body }),
    cache: "no-store",
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
