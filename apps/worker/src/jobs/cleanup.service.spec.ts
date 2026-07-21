import { CleanupService } from "./cleanup.service";
import * as db from "../infra/db";

// Example unit test for the worker unit (Jest — fallback runner, see
// scaffold-notes). The pool is faked so no live Postgres is needed.
describe("CleanupService", () => {
  it("runs a no-op tick and returns zeroed counters", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const end = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(db, "getPool")
      .mockReturnValue({ query, end } as unknown as ReturnType<typeof db.getPool>);

    const result = await new CleanupService().runOnce();

    expect(result).toEqual({ outboxDrained: 0, tasksPurged: 0 });
    expect(query).toHaveBeenCalledWith("SELECT 1");
    expect(end).toHaveBeenCalled();
  });
});
