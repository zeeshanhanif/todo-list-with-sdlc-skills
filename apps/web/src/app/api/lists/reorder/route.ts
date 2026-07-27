import { NextRequest, NextResponse } from "next/server";
import { LIST_REORDER_PATH } from "@todo/shared";

// BFF proxy for the reorder endpoint (ADR-002; FEAT-009 technical-design §5).
// Body is the caller's complete set of list ids in the desired order (D2);
// status + JSON relayed verbatim (200 lists / 400 validation_failed on listIds /
// 401 unauthenticated).
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}${LIST_REORDER_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: await req.text(),
    cache: "no-store",
  });
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
