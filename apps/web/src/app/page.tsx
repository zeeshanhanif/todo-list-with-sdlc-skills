import { requireSession } from "@/lib/session";
import { fetchLists } from "@/lib/lists";
import { fetchListTasks } from "@/lib/tasks";
import { AppShell } from "@/components/app-shell";
import { ListView } from "@/components/list-view";
import { ListViewFailure } from "@/components/list-view-failure";

// The authenticated app home (where sign-in lands): the caller's **default
// list**, rendered by the same component as /lists/{id} rather than redirecting
// to it (FEAT-010 technical-design D2). For a brand-new account this is
// SCR-WEB-018's first-run state (ui-design D1).
export const dynamic = "force-dynamic";

export default async function Home() {
  await requireSession();
  const lists = await fetchLists();
  const defaultList = lists?.find((l) => l.isDefault) ?? lists?.[0];

  if (!defaultList) {
    // The lists fetch failed — every account has an Inbox (FR-LIST-003), so an
    // empty result here is an outage, not a state. The sidebar renders its own
    // error; the column says so too.
    return (
      <AppShell>
        <ListViewFailure kind="error" />
      </AppShell>
    );
  }

  const result = await fetchListTasks(defaultList.id);

  return (
    <AppShell activeListId={defaultList.id}>
      {result.kind === "ok" ? (
        <ListView
          data={result.data}
          firstRun={
            lists?.length === 1 &&
            result.data.active.length === 0 &&
            result.data.completed.length === 0
          }
        />
      ) : (
        <ListViewFailure
          kind={result.kind === "not-found" ? "not-found" : "error"}
        />
      )}
    </AppShell>
  );
}
