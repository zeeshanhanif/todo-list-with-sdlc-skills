import { render, screen } from "@testing-library/react";
import type { SmartView, SmartViewResponse } from "@todo/shared";
import { PreferencesProvider } from "./preferences-provider";
import { SmartViewScreen, SmartViewFailure } from "./smart-view";
import Loading from "../app/views/[view]/loading";

// FEAT-016 T9 — SCR-WEB-009's states, as an automated check of AC-15 and AC-16.
// The E2E covers populated, empty and not-found against the real stack; these
// pin the two the browser cannot reach without breaking the database (`error`),
// the one that lasts milliseconds (`loading`), and the per-view copy rules that
// are a design decision rather than a rendering accident (ui-design D3).

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

const page = (over: Partial<SmartViewResponse> = {}): SmartViewResponse => ({
  view: "today",
  results: [],
  nextCursor: null,
  ...over,
});

const task = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  listId: "22222222-2222-4222-8222-222222222222",
  listName: "Work",
  title: "Draft the quarterly report",
  completedAt: null,
  createdAt: "2026-07-31T09:00:00.000Z",
  dueAt: "2026-07-31T17:00:00.000Z",
  priority: "high" as const,
  isOverdue: false,
  ...over,
});

const renderScreen = (view: SmartView, data: SmartViewResponse) =>
  render(
    <PreferencesProvider profile={null}>
      <SmartViewScreen view={view} initial={data} />
    </PreferencesProvider>,
  );

describe("SCR-WEB-009 — populated (AC-16)", () => {
  it("renders the FULL task-row: checkbox, title, list badge, due chip, priority dot", () => {
    renderScreen("today", page({ results: [task()] }));

    // The checkbox is what makes this row the full design.md task-row rather
    // than SCR-WEB-012's read-only subset (ui-design D2).
    expect(screen.getByTestId("task-checkbox")).toBeInTheDocument();
    expect(screen.getByText("Draft the quarterly report")).toBeInTheDocument();
    expect(screen.getByTestId("view-list-badge")).toHaveTextContent("Work");
    expect(screen.getByTestId("due-chip")).toBeInTheDocument();
    expect(screen.getByTestId("priority-dot")).toBeInTheDocument();
    // The whole row navigates to the task's detail surface (SCR-WEB-010).
    expect(screen.getByTestId("view-task-link")).toHaveAttribute(
      "href",
      `/tasks/${task().id}`,
    );
  });

  it("claims no total while a next page remains", () => {
    renderScreen("all", page({ results: [task()], nextCursor: "abc" }));
    expect(screen.getByTestId("view-subtitle")).toHaveTextContent("1 task so far");
    expect(screen.getByTestId("view-load-more")).toBeInTheDocument();
  });

  it("drops the 'so far' and the control once the last page is in", () => {
    renderScreen("all", page({ results: [task()] }));
    expect(screen.getByTestId("view-subtitle")).toHaveTextContent("1 task");
    expect(screen.getByTestId("view-subtitle")).not.toHaveTextContent("so far");
    expect(screen.queryByTestId("view-load-more")).not.toBeInTheDocument();
  });
});

describe("SCR-WEB-009 — empty, per view (AC-8, ui-design D3)", () => {
  it.each([
    ["today", "Nothing due today", true],
    ["upcoming", "Nothing coming up", true],
    ["all", "No active tasks", true],
    // An empty Overdue is good news; answering it with "Add a task" would read
    // as the product failing to notice.
    ["overdue", "Nothing overdue", false],
  ] as const)("%s says %s and %s an action", (view, headline, hasAction) => {
    renderScreen(view, page({ view }));

    expect(screen.getByTestId("view-empty")).toHaveTextContent(headline);
    if (hasAction) {
      expect(screen.getByTestId("view-empty-action")).toHaveAttribute(
        "href",
        "/",
      );
    } else {
      expect(screen.queryByTestId("view-empty-action")).not.toBeInTheDocument();
    }
  });

  it("shows no count line when there is nothing to count", () => {
    renderScreen("today", page());
    expect(screen.queryByTestId("view-subtitle")).not.toBeInTheDocument();
  });
});

describe("SCR-WEB-009 — loading and error (AC-15)", () => {
  it("loading is skeleton rows, marked busy and announced politely", () => {
    render(<Loading />);

    const region = screen.getByTestId("view-loading");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region.querySelectorAll("li")).toHaveLength(6);
    expect(screen.getByRole("status")).toHaveTextContent("Loading tasks");
  });

  it("error explains and offers a retry", () => {
    render(<SmartViewFailure kind="error" />);

    const alert = screen.getByTestId("view-error");
    expect(alert).toHaveTextContent("Couldn't load this view.");
    expect(screen.getByTestId("view-retry")).toBeInTheDocument();
    // The tint's PARTNER token, never --color-danger on --color-danger-subtle
    // (3.95:1 — DEF-003/DEF-006).
    expect(alert).toHaveStyle({ color: "var(--color-danger-text)" });
  });

  it("not-found sends the user back instead of offering a doomed retry", () => {
    render(<SmartViewFailure kind="not-found" />);

    expect(screen.getByTestId("view-not-found")).toHaveTextContent(
      "That view doesn't exist.",
    );
    expect(screen.queryByTestId("view-retry")).not.toBeInTheDocument();
    expect(screen.getByTestId("view-back-home")).toHaveAttribute("href", "/");
  });
});
