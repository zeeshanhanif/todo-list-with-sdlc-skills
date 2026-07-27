import { NextRequest, NextResponse } from "next/server";
import { LISTS_PATH } from "@todo/shared";

// BFF proxy for a single list (ADR-002; FEAT-009 technical-design §5): PATCH
// renames (FR-LIST-006), DELETE removes the list and its tasks (FR-LIST-007).
// Cookie forwarded; status + JSON relayed verbatim, including 404 list_not_found
// (unknown or not owned — the API never distinguishes them, FR-AUTHZ-003) and
// 409 list_not_deletable (the Inbox, FR-LIST-004).
// Next's static segments win over dynamic ones, so /api/lists/reorder is served
// by its own route and never captured here.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  return proxy(req, "PATCH", id, await req.text());
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  return proxy(req, "DELETE", id);
}

async function proxy(
  req: NextRequest,
  method: string,
  id: string,
  body?: string,
): Promise<NextResponse> {
  const cookie = req.headers.get("cookie");
  const res = await fetch(`${API_URL}${LISTS_PATH}/${encodeURIComponent(id)}`, {
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
