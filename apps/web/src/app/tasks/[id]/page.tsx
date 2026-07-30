import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { fetchTask } from "@/lib/tasks";
import { AppShell } from "@/components/app-shell";
import { TaskDetail } from "@/components/task-detail";
import { TaskDetailFailure } from "@/components/task-detail-failure";

// SCR-WEB-010 — Task Detail at /tasks/{id} (FEAT-011 ui-design D1).
//
// **Route first.** This is the addressable, deep-linkable surface: a detail view
// users refresh, bookmark and share must have a URL. When the user arrives by
// clicking a task row instead, the sibling intercepting route
// (app/@detail/(.)tasks/[id]) renders the same component in the shell's detail
// host, per design.md §3 — same content, two presentations, one route.
//
// Server component, so the task arrives with the first paint (no loading flash
// in the common path — the same choice SCR-WEB-008 made).
export const dynamic = "force-dynamic";

export default async function TaskPage({
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
    <AppShell
      activeListId={result.kind === "ok" ? result.data.list.id : undefined}
    >
      <div style={{ marginBottom: "var(--space-5)" }}>
        <Link
          href={result.kind === "ok" ? `/lists/${result.data.list.id}` : "/"}
          data-testid="detail-back"
          style={{
            fontSize: "var(--font-size-small)",
            color: "var(--color-primary)",
          }}
        >
          ← Back to {result.kind === "ok" ? result.data.list.name : "your tasks"}
        </Link>
      </div>

      {result.kind === "ok" ? (
        <TaskDetail
          task={result.data.task}
          list={result.data.list}
          presentation="page"
        />
      ) : (
        <TaskDetailFailure kind={result.kind} />
      )}
    </AppShell>
  );
}
