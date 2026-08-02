import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_EXPORT_PATH } from "@todo/shared";

// BFF proxy for the data export (ADR-002; FEAT-017 technical-design §5.2).
// Forwards the browser's session cookie so the API's SessionGuard can resolve
// the caller, and relays status + body verbatim (200 the export document /
// 401 unauthenticated). No Set-Cookie relay is needed — the export never
// rotates the session.
//
// Unlike the profile proxy this also relays **Content-Disposition**: the
// filename is computed server-side in the user's timezone (D5) and the client
// uses it for the download's `download` attribute, so dropping the header here
// would silently push the client onto its fallback.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}${ACCOUNT_EXPORT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    cache: "no-store",
  });

  const disposition = res.headers.get("content-disposition");
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: {
      "content-type": "application/json",
      ...(disposition ? { "content-disposition": disposition } : {}),
    },
  });
}
