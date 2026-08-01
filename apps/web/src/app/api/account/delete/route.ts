import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_DELETE_PATH } from "@todo/shared";

// BFF proxy for account deletion (ADR-002; FEAT-018 technical-design §5.2).
// Shaped like the change-password proxy rather than the export one, because it
// does both halves: it forwards the browser's session cookie so the API's
// SessionGuard can resolve the caller AND relays the API's Set-Cookie back, so
// the *cleared* cookie lands on the web origin. The client IP is forwarded for
// the per-IP limiter (D9) and the audit row.
//
// Status + JSON envelope are relayed verbatim (200 account_deleted;
// 400 current_password_invalid/validation_failed; 401 unauthenticated;
// 429 rate_limited).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const cookie = req.headers.get("cookie");
  const xff = req.headers.get("x-forwarded-for");
  const res = await fetch(`${API_URL}${ACCOUNT_DELETE_PATH}`, {
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
