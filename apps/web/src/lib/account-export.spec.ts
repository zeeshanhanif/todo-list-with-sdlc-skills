import { accountExportFilename, type AccountExportDocument } from "@todo/shared";
import { filenameFrom, requestExport } from "./account-export";

// FEAT-017 T5 — the client half of the export request. What matters here is the
// FAILURE shapes: NFR-REL-004 wants the screen to render an error state, and a
// helper that throws on a non-JSON body would strand it instead.

const doc = (over: Partial<AccountExportDocument> = {}): AccountExportDocument => ({
  formatVersion: 1,
  exportedAt: "2026-08-01T20:30:00.000Z",
  account: {
    email: "sam@example.com",
    displayName: null,
    timezone: null,
    theme: "system",
    createdAt: "2026-07-22T11:02:41.006Z",
  },
  lists: [],
  ...over,
});

const respond = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
};

afterEach(() => jest.restoreAllMocks());

describe("requestExport", () => {
  it("returns the document and the server's filename on 200", async () => {
    respond(200, doc(), {
      "content-disposition": 'attachment; filename="todo-export-2026-08-02.json"',
    });

    const result = await requestExport();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.filename).toBe("todo-export-2026-08-02.json");
    expect(result.document.formatVersion).toBe(1);
  });

  it("posts to the BFF, not the API directly (the cookie must stay same-origin)", async () => {
    respond(200, doc());

    await requestExport();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/account/export",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports 401 as `unauthenticated` so the screen can send the user to sign in", async () => {
    respond(401, { statusCode: 401, code: "unauthenticated", message: "…" });

    await expect(requestExport()).resolves.toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("reports a 500 as a typed failure rather than throwing (NFR-REL-004)", async () => {
    respond(500, { statusCode: 500, code: "internal_error", message: "…" });

    await expect(requestExport()).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("survives a body that is not JSON at all — the throw a naive version takes", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    }) as unknown as typeof fetch;

    await expect(requestExport()).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("survives a network failure", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    await expect(requestExport()).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("filenameFrom", () => {
  it("reads the quoted header form", () => {
    expect(
      filenameFrom('attachment; filename="todo-export-2026-08-02.json"', doc()),
    ).toBe("todo-export-2026-08-02.json");
  });

  it("reads the unquoted form", () => {
    expect(
      filenameFrom("attachment; filename=todo-export-2026-08-02.json", doc()),
    ).toBe("todo-export-2026-08-02.json");
  });

  it("falls back to the SHARED rule when the header is missing, so the name is identical either way (D5)", () => {
    const document = doc({ account: { ...doc().account, timezone: "Asia/Calcutta" } });

    expect(filenameFrom(null, document)).toBe(
      accountExportFilename(document.exportedAt, "Asia/Calcutta"),
    );
    // 20:30 UTC is already the 2nd in Calcutta — the fallback honours the
    // user's zone rather than quietly reverting to UTC.
    expect(filenameFrom(null, document)).toBe("todo-export-2026-08-02.json");
  });

  it("falls back to UTC when the account has no timezone", () => {
    expect(filenameFrom(null, doc())).toBe("todo-export-2026-08-01.json");
  });
});
