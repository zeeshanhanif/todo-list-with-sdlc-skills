import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { fetchTask } from "@/lib/tasks";
import { DetailPanel } from "@/components/detail-panel";
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
export const dynamic = "force-dynamic";

export default async function InterceptedTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const result = await fetchTask(id);

  if (result.kind === "unauthenticated") {
    redirect("/signin");
  }

  return (
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
  );
}
