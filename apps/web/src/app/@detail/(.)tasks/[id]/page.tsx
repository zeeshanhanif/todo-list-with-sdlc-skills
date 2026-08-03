import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { fetchTask } from "@/lib/tasks";
import { fetchProfile } from "@/lib/profile";
import { DetailPanel } from "@/components/detail-panel";
import { PreferencesProvider } from "@/components/preferences-provider";
import { TaskDetail } from "@/components/task-detail";
import { TaskDetailFailure } from "@/components/task-detail-failure";

// SCR-WEB-010 as the shell's DETAIL HOST (FEAT-011 ui-design D1).
//
// This is the INTERCEPTED presentation: clicking a task row soft-navigates to
// /tasks/{id}, Next intercepts it here, and the detail slides in over the list
// instead of replacing it — design.md §3's "optional right task-detail panel
// that slides in". Refreshing or opening the link directly is a hard navigation,
// which is NOT intercepted: app/tasks/[id]/page.tsx renders the full page and
// @detail/default.tsx renders nothing. One route, two presentations, and the URL
// is real in both.
//
// The same TaskDetail component renders in both, so the two can never drift.
//
// DEF-015 — this slot is its own PREFERENCES HOST, and has to be. `@detail` is a
// parallel route: the root layout renders it as a SIBLING of `children`, so it
// sits OUTSIDE the app shell and therefore outside the `PreferencesProvider`
// that shell mounts (FEAT-008 technical-design §5.2). Without this wrapper
// `useTimeZone()` inside the panel fell through to its `"UTC"` fallback, so the
// panel showed a due instant five hours off for a UTC+5 account — and, worse,
// read the user's typed wall clock back as UTC when they edited it. The full
// page at app/tasks/[id] renders inside AppShell and never had the bug, which
// is how one URL came to show two different clocks.
//
// The profile is fetched in the same Promise.all as the task, so the panel costs
// one parallel primary-key read rather than a second round-trip of latency —
// the shell's own D7 reasoning, applied to the slot that shares its zone.
export const dynamic = "force-dynamic";

export default async function InterceptedTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const [result, profile] = await Promise.all([fetchTask(id), fetchProfile()]);

  if (result.kind === "unauthenticated") {
    redirect("/signin");
  }

  return (
    <PreferencesProvider profile={profile}>
      <DetailPanel>
        {result.kind === "ok" ? (
          <TaskDetail
            task={result.data.task}
            list={result.data.list}
            presentation="panel"
          />
        ) : (
          <TaskDetailFailure kind={result.kind} />
        )}
      </DetailPanel>
    </PreferencesProvider>
  );
}
