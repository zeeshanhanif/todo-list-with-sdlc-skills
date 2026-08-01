import { AUTH_ERROR_CODES, type ApiError } from "@todo/shared";

// Client-side account deletion (FEAT-018 technical-design §5.2). Called from
// the delete island; goes through the BFF proxy so the session cookie travels
// same-origin and the cleared cookie comes back to this origin.

/** Either the deletion happened, or a typed failure.
 *
 * Never throws: NFR-REL-004 wants the screen to render an error state, not to
 * blow up — and `res.json()` on a proxy error page is exactly the throw a naive
 * version would take. The reasons are distinguished because the screen treats
 * them differently: `invalid_password` is a field error the user can correct on
 * the spot, `unauthenticated` is a redirect, `rate_limited` carries a wait, and
 * `failed` is the retryable form-level alert. */
export type DeleteAccountResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_password" | "unauthenticated" | "rate_limited" | "failed";
      /** Seconds to wait, on `rate_limited` only. */
      retryAfterSeconds?: number;
    };

/** Delete the signed-in account (FR-DATA-003/004; UC-016 main 3-4).
 *
 * `confirm: true` is sent from the dialog's confirm handler and nowhere else —
 * it is the contract's half of FR-DATA-004's explicit confirmation
 * (technical-design D3), so a code path that has not shown the dialog has no
 * business calling this function. */
export async function requestAccountDelete(input: {
  currentPassword: string;
}): Promise<DeleteAccountResult> {
  try {
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: input.currentPassword,
        confirm: true,
      }),
    });

    if (res.ok) return { ok: true };

    if (res.status === 401) return { ok: false, reason: "unauthenticated" };

    const body = (await res.json().catch(() => null)) as
      | (ApiError & { retryAfterSeconds?: number })
      | null;

    if (res.status === 429) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAfterSeconds: body?.retryAfterSeconds,
      };
    }
    if (body?.code === AUTH_ERROR_CODES.currentPasswordInvalid) {
      return { ok: false, reason: "invalid_password" };
    }
    // A `validation_failed` on `currentPassword` reaches here only if the
    // client sent an empty field, which the screen prevents — treated as the
    // same correctable field error rather than a mysterious generic failure.
    if (
      body?.code === "validation_failed" &&
      body.fields?.some((f) => f.field === "currentPassword")
    ) {
      return { ok: false, reason: "invalid_password" };
    }
    return { ok: false, reason: "failed" };
  } catch {
    // Network failure, or a body that is not the JSON we were promised.
    return { ok: false, reason: "failed" };
  }
}
