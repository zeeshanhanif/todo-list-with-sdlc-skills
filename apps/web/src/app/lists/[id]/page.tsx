import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { fetchLists } from "@/lib/lists";
import { fetchListTasks } from "@/lib/tasks";
import { AppShell } from "@/components/app-shell";
import { ListView } from "@/components/list-view";
import { ListViewFailure } from "@/components/list-view-failure";

// SCR-WEB-008 — the list view at /lists/{id} (FEAT-010 ui-design). Server
// component: the tasks arrive with the first paint. An unknown OR unowned id
// gets one uniform not-found state — the screen must never disclose which
// (FR-AUTHZ-003, technical-design §3.1).
export const dynamic = "force-dynamic";

export default async function ListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const [result, lists] = await Promise.all([fetchListTasks(id), fetchLists()]);

  if (result.kind === "unauthenticated") {
    redirect("/signin");
  }

  return (
    <AppShell activeListId={id}>
      {result.kind === "ok" ? (
        <ListView
          data={result.data}
          firstRun={isFirstRun(lists, result.data)}
        />
      ) : (
        <ListViewFailure kind={result.kind} />
      )}
    </AppShell>
  );
}

/** SCR-WEB-018's trigger (ui-design D1): the account has exactly one list — the
 * default one — and it has no tasks. First-run is about the account, not the
 * list, so any other empty list gets SCR-WEB-008's generic empty state. */
function isFirstRun(
  lists: Awaited<ReturnType<typeof fetchLists>>,
  view: { list: { isDefault: boolean }; active: unknown[]; completed: unknown[] },
): boolean {
  return (
    lists?.length === 1 &&
    view.list.isDefault &&
    view.active.length === 0 &&
    view.completed.length === 0
  );
}
