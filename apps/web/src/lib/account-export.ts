import {
  accountExportFilename,
  type AccountExportDocument,
} from "@todo/shared";

// Client-side export request (FEAT-017 technical-design §5.2). Called from the
// export island; goes through the BFF proxy so the session cookie travels
// same-origin.

/** Either the whole document with the name to save it under, or a typed
 * failure. Never throws: NFR-REL-004 wants the screen to render an error state,
 * not to blow up — and `res.json()` on a proxy error page is exactly the throw
 * a naive version would take. */
export type ExportResult =
  | { ok: true; document: AccountExportDocument; filename: string }
  | { ok: false; reason: "unauthenticated" | "failed" };

/** The filename the server chose, or the shared rule applied locally.
 *
 * The fallback is not decoration: if the header is ever dropped by a proxy the
 * download still gets a correct, *identical* name, because both sides call
 * `accountExportFilename` (D5). It parses the quoted and bare forms of
 * `attachment; filename="…"`. */
export function filenameFrom(
  header: string | null,
  document: AccountExportDocument,
): string {
  const match = header?.match(/filename\s*=\s*"?([^";]+)"?/i);
  return (
    match?.[1]?.trim() ||
    accountExportFilename(document.exportedAt, document.account.timezone ?? "UTC")
  );
}

/** Ask the API for this account's export (FR-DATA-001; UC-015 main 1-2). */
export async function requestExport(): Promise<ExportResult> {
  try {
    const res = await fetch("/api/account/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    if (res.status === 401) return { ok: false, reason: "unauthenticated" };
    if (!res.ok) return { ok: false, reason: "failed" };

    const document = (await res.json()) as AccountExportDocument;
    return {
      ok: true,
      document,
      filename: filenameFrom(res.headers.get("content-disposition"), document),
    };
  } catch {
    // Network failure, or a body that is not the JSON we were promised.
    return { ok: false, reason: "failed" };
  }
}

/** Hand the document to the browser as a file (UC-015 main 3).
 *
 * A fetch-based POST cannot let the browser's own download machinery act on
 * `Content-Disposition`, so the client re-serializes — pretty-printed, because
 * the file is meant to be openable by a human as well as a machine
 * (FR-DATA-001). The object URL is revoked immediately after the click; the
 * download has already been handed off by then. */
export function downloadDocument(
  document_: AccountExportDocument,
  filename: string,
): void {
  const blob = new Blob([JSON.stringify(document_, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
