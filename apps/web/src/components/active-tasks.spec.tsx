import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TaskSummary } from "@todo/shared";
import { ActiveTasks } from "./active-tasks";

// FEAT-014 T7 — SCR-WEB-008's reorder affordance, as an automated check of
// AC-12 (full keyboard operability — the criterion a pointer-only drag fails
// outright) and AC-15 (a failed move surfaces an error and leaves no
// half-applied order). The E2E covers the persisted happy path against the real
// stack; these pin the two things a browser test cannot reach cheaply: the
// keyboard paths, and a server that says no.

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: (...a: unknown[]) => refresh(...a) }),
}));

const task = (id: string, title: string, position: number): TaskSummary => ({
  id,
  listId: "22222222-2222-4222-8222-222222222222",
  title,
  completedAt: null,
  createdAt: "2026-07-31T09:00:00.000Z",
  dueAt: null,
  priority: "none",
  isOverdue: false,
  position,
});

const TASKS = [
  task("11111111-1111-4111-8111-111111111111", "alpha", 0),
  task("11111111-1111-4111-8111-111111111112", "beta", 1),
  task("11111111-1111-4111-8111-111111111113", "gamma", 2),
];

const titles = (): string[] =>
  screen
    .getAllByTestId("task-row")
    .map((row) => row.getAttribute("data-task-title") ?? "");

const sentOrder = (): string[] => {
  const call = (global.fetch as jest.Mock).mock.calls.at(-1) as [
    string,
    { body: string },
  ];
  return (JSON.parse(call[1].body) as { taskIds: string[] }).taskIds;
};

beforeEach(() => {
  refresh.mockClear();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  }) as unknown as typeof fetch;
});

describe("ActiveTasks — the reorder affordance (SCR-WEB-008)", () => {
  it("AC-12: every row's handle is a real button with an accessible name", () => {
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    const handles = screen.getAllByTestId("reorder-handle");
    expect(handles).toHaveLength(3);
    for (const [i, handle] of handles.entries()) {
      expect(handle.tagName).toBe("BUTTON");
      expect(handle).toHaveAccessibleName(`Reorder: ${TASKS[i].title}`);
    }
  });

  it("AC-12: ArrowDown on a focused handle moves the task, and focus stays with the row", async () => {
    const user = userEvent.setup();
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    await user.tab(); // into the first row's checkbox
    const handle = screen.getAllByTestId("reorder-handle")[0];
    handle.focus();
    await user.keyboard("{ArrowDown}");

    expect(titles()).toEqual(["beta", "alpha", "gamma"]);
    expect(sentOrder()).toEqual([TASKS[1].id, TASKS[0].id, TASKS[2].id]);
    // Focus travels WITH the row, so a second press keeps moving the SAME task
    // — the property that makes "move three places" three keystrokes.
    expect(document.activeElement).toHaveAccessibleName("Reorder: alpha");

    await user.keyboard("{ArrowDown}");
    expect(titles()).toEqual(["beta", "gamma", "alpha"]);
  });

  it("AC-12: the ends are no-ops, not errors — nothing is sent", async () => {
    const user = userEvent.setup();
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    screen.getAllByTestId("reorder-handle")[0].focus();
    await user.keyboard("{ArrowUp}");
    screen.getAllByTestId("reorder-handle")[2].focus();
    await user.keyboard("{ArrowDown}");

    expect(titles()).toEqual(["alpha", "beta", "gamma"]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("reorder-error")).not.toBeInTheDocument();
  });

  it("AC-12: activating the handle reveals labelled move controls, disabled at the ends", async () => {
    const user = userEvent.setup();
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    // The touch/pointer path: no arrow keys needed at all.
    await user.click(screen.getAllByTestId("reorder-handle")[0]);

    const firstRow = screen.getAllByTestId("task-row")[0];
    const up = within(firstRow).getByTestId("move-up");
    const down = within(firstRow).getByTestId("move-down");
    expect(up).toHaveAccessibleName("Move up: alpha");
    expect(down).toHaveAccessibleName("Move down: alpha");
    expect(up).toBeDisabled(); // first row
    expect(down).toBeEnabled();

    await user.click(down);
    expect(titles()).toEqual(["beta", "alpha", "gamma"]);
  });

  it("AC-12: the move is announced politely — the only feedback a screen-reader user gets", async () => {
    const user = userEvent.setup();
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    const region = screen.getByTestId("reorder-announcement");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent(""); // silent until something happens

    screen.getAllByTestId("reorder-handle")[0].focus();
    await user.keyboard("{ArrowDown}");

    expect(region).toHaveTextContent("Moved alpha to 2 of 3.");
  });

  it("AC-15: a rejected move rolls the order back and says so", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    screen.getAllByTestId("reorder-handle")[0].focus();
    await user.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(screen.getByTestId("reorder-error")).toHaveTextContent(
        "Couldn't save the new order.",
      ),
    );
    // The rendered order matches the stored one again — no half-applied move.
    expect(titles()).toEqual(["alpha", "beta", "gamma"]);
    expect(screen.getByTestId("reorder-announcement")).toHaveTextContent("");
    // A 400 means our vector is stale, so the list is replaced rather than left.
    expect(refresh).toHaveBeenCalled();
  });

  it("AC-15: a network failure rolls back the same way", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    screen.getAllByTestId("reorder-handle")[0].focus();
    await user.keyboard("{ArrowDown}");

    await waitFor(() =>
      expect(screen.getByTestId("reorder-error")).toBeInTheDocument(),
    );
    expect(titles()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("a single active task gets no handle — nothing to reorder", () => {
    render(<ActiveTasks listId="list-1" tasks={[TASKS[0]]} />);

    expect(screen.getAllByTestId("task-row")).toHaveLength(1);
    expect(screen.queryByTestId("reorder-handle")).not.toBeInTheDocument();
  });

  // --- Acceptance (FEAT-014 verification) — the drag path ---
  //
  // ui-design D1 specifies THREE affordances and T7 tested two: the pointer
  // drag shipped with no coverage at all, and its `dropOn` carries the one
  // genuinely error-prone line in this component — the splice-index correction
  // for a downward move, where removing the row first shifts every later index
  // by one. An off-by-one there lands the task one place from where it was
  // dropped, silently, on the affordance UC-010 main 2 names by name.

  const drag = (fromIndex: number, toIndex: number) => {
    const handles = screen.getAllByTestId("reorder-handle");
    const rows = screen.getAllByTestId("task-row");
    fireEvent.dragStart(handles[fromIndex]);
    fireEvent.dragOver(rows[toIndex]);
    fireEvent.drop(rows[toIndex]);
  };

  it("UC-010 main 2: dragging a row DOWN lands it before the row it was dropped on", async () => {
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    // The drop indicator is drawn on the target row's LEADING edge, so dropping
    // `alpha` on `gamma` means "put alpha immediately before gamma".
    drag(0, 2);

    await waitFor(() => expect(titles()).toEqual(["beta", "alpha", "gamma"]));
    expect(sentOrder()).toEqual([TASKS[1].id, TASKS[0].id, TASKS[2].id]);
  });

  it("UC-010 main 2: dragging a row UP lands it before the target too", async () => {
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    drag(2, 0);

    await waitFor(() => expect(titles()).toEqual(["gamma", "alpha", "beta"]));
    expect(sentOrder()).toEqual([TASKS[2].id, TASKS[0].id, TASKS[1].id]);
  });

  it("UC-010 main 2: dropping a row on itself, or on the row just after it, changes nothing", async () => {
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    drag(0, 0); // onto itself
    expect(titles()).toEqual(["alpha", "beta", "gamma"]);
    // Onto the NEXT row's leading edge — which is where `alpha` already is.
    drag(0, 1);
    expect(titles()).toEqual(["alpha", "beta", "gamma"]);
    // Neither is a write: a no-op move must not spend a request.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("AC-15: a failed DRAG rolls back exactly as a failed keyboard move does", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    render(<ActiveTasks listId="list-1" tasks={TASKS} />);

    drag(0, 2);

    await waitFor(() =>
      expect(screen.getByTestId("reorder-error")).toBeInTheDocument(),
    );
    expect(titles()).toEqual(["alpha", "beta", "gamma"]);
  });
});
