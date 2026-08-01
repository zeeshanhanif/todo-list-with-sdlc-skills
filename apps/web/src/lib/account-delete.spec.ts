import { AUTH_ERROR_CODES } from "@todo/shared";
import { requestAccountDelete } from "./account-delete";

// FEAT-018 T6 — the client half of the delete request. What matters here is the
// FAILURE shapes: the screen renders four different things for them (a field
// error, a redirect, a wait, a retryable alert), so collapsing them would be a
// user-visible bug — and a helper that throws on a non-JSON body would strand
// the screen entirely (NFR-REL-004).

const respond = (status: number, body: unknown = null): void => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
};

afterEach(() => jest.restoreAllMocks());

describe("requestAccountDelete", () => {
  it("sends the password and the confirm literal, and reports success on 200", async () => {
    respond(200, { status: "account_deleted" });

    await expect(
      requestAccountDelete({ currentPassword: "pw" }),
    ).resolves.toEqual({ ok: true });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    // `confirm: true` is the contract's half of FR-DATA-004 (D3) — its absence
    // would be a 400, so this assertion is the reason the happy path works.
    expect(JSON.parse(init.body as string)).toEqual({
      currentPassword: "pw",
      confirm: true,
    });
  });

  it("maps 400 current_password_invalid to a correctable field error", async () => {
    respond(400, {
      statusCode: 400,
      code: AUTH_ERROR_CODES.currentPasswordInvalid,
      message: "That password is incorrect.",
      fields: [{ field: "currentPassword", message: "That password is incorrect." }],
    });

    await expect(
      requestAccountDelete({ currentPassword: "wrong" }),
    ).resolves.toEqual({ ok: false, reason: "invalid_password" });
  });

  it("maps a validation_failed on currentPassword to the same field error", async () => {
    respond(400, {
      statusCode: 400,
      code: "validation_failed",
      message: "Validation failed.",
      fields: [{ field: "currentPassword", message: "Your password is required." }],
    });

    await expect(
      requestAccountDelete({ currentPassword: "" }),
    ).resolves.toEqual({ ok: false, reason: "invalid_password" });
  });

  it("maps 401 to unauthenticated without reading the body", async () => {
    respond(401, { code: "unauthenticated" });

    await expect(
      requestAccountDelete({ currentPassword: "pw" }),
    ).resolves.toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("maps 429 to rate_limited, carrying the wait", async () => {
    respond(429, {
      statusCode: 429,
      code: AUTH_ERROR_CODES.rateLimited,
      message: "Too many attempts.",
      retryAfterSeconds: 42,
    });

    await expect(
      requestAccountDelete({ currentPassword: "pw" }),
    ).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 42,
    });
  });

  it("maps a 500 to the typed failure rather than throwing (NFR-REL-004)", async () => {
    respond(500, { statusCode: 500, code: "internal_error", message: "..." });

    await expect(
      requestAccountDelete({ currentPassword: "pw" }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("survives a non-JSON error body — the proxy error page a naive version throws on", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
    }) as unknown as typeof fetch;

    await expect(
      requestAccountDelete({ currentPassword: "pw" }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("survives a network failure", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;

    await expect(
      requestAccountDelete({ currentPassword: "pw" }),
    ).resolves.toEqual({ ok: false, reason: "failed" });
  });
});
