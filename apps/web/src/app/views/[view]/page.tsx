import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { asSmartView, fetchSmartView } from "@/lib/views";
import { SmartViewScreen, SmartViewFailure } from "@/components/smart-view";

// SCR-WEB-009 — the smart view at /views/{today|upcoming|overdue|all}
// (FEAT-016 ui-design). Server component: the first page of tasks arrives with
// the first paint, the shape SCR-WEB-008 uses; only "Load more" talks to the
// BFF. The shell lives in this segment's layout so the skeleton in loading.tsx
// replaces the tasks and not the frame.
//
// A view name outside the four renders the not-found state in-shell — a URL
// typo, not an ownership question (technical-design D6).
export const dynamic = "force-dynamic";

export default async function SmartViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  await requireSession();
  const { view } = await params;
  const result = await fetchSmartView(view);

  if (result.kind === "unauthenticated") {
    redirect("/signin");
  }
  if (result.kind === "not-found") {
    return <SmartViewFailure kind="not-found" />;
  }

  // Narrowed from the URL, not the response: the screen needs the view name
  // before it renders a heading, and an unknown one never reaches here.
  const known = result.kind === "ok" ? asSmartView(view) : null;
  if (!known || result.kind !== "ok") {
    return <SmartViewFailure kind="error" />;
  }

  return <SmartViewScreen view={known} initial={result.data} />;
}
