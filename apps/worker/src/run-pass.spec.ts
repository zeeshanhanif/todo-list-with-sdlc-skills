import { Logger } from "@nestjs/common";
import { runPass } from "./run-pass";

// FEAT-020 design §6 AC-9 (ADR-007, D4): the job's two passes are independent —
// a failure in one must not prevent the other, and the run must still fail.
// This covers the seam main.ts composes; T5 additionally demonstrated it against
// the built job by injecting a throw into each real service.
describe("runPass (AC-9 — independent job passes)", () => {
  let errors: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    errors = [];
    spy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation((msg: unknown) => {
        errors.push(String(msg));
      });
  });

  afterEach(() => spy.mockRestore());

  it("carries the pass's summary out on success, and logs nothing", async () => {
    const outcome = await runPass("outbox drain", async () => ({ sent: 3 }));

    // The summary is what main.ts puts on the completion line (AC-8) — if it
    // were dropped here, that line could not report it.
    expect(outcome).toEqual({ summary: { sent: 3 }, error: null });
    expect(errors).toHaveLength(0);
  });

  it("captures a thrown failure instead of propagating it, and logs it structured", async () => {
    const boom = new Error("provider down");

    const result = await runPass("outbox drain", () => Promise.reject(boom));

    expect(result.error).toBe(boom);
    expect(result.summary).toBeNull();
    expect(errors).toHaveLength(1);
    expect(JSON.parse(errors[0])).toEqual({
      msg: "outbox drain pass failed",
      error: "provider down",
    });
  });

  it("wraps a non-Error rejection so the caller always gets an Error", async () => {
    const result = await runPass("task purge", () => Promise.reject("nope"));

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe("nope");
  });

  it("a failing first pass does not stop the second, and the run still reports failure", async () => {
    const ran: string[] = [];

    // Exactly main.ts's composition: both passes attempt, in order.
    const outcomes = [
      await runPass("outbox drain", (): Promise<unknown> => {
        ran.push("drain");
        throw new Error("INJECTED drain failure");
      }),
      await runPass("task purge", async () => {
        ran.push("purge");
        return { purged: 4 };
      }),
    ];

    expect(ran).toEqual(["drain", "purge"]); // the purge ran anyway
    expect(outcomes.filter((o) => o.error !== null)).toHaveLength(1);
    expect(outcomes[0].error?.message).toBe("INJECTED drain failure");
    // AC-8 under failure: the surviving pass keeps its summary, so the
    // completion line can still report it.
    expect(outcomes[0].summary).toBeNull();
    expect(outcomes[1].summary).toEqual({ purged: 4 });
  });

  it("a failing second pass does not retroactively skip the first, and still reports failure", async () => {
    const ran: string[] = [];

    const outcomes = [
      await runPass("outbox drain", async () => {
        ran.push("drain");
        return { sent: 2, retried: 0, deadLettered: 0 };
      }),
      await runPass("task purge", (): Promise<unknown> => {
        ran.push("purge");
        throw new Error("INJECTED purge failure");
      }),
    ];

    expect(ran).toEqual(["drain", "purge"]);
    expect(outcomes[1].error?.message).toBe("INJECTED purge failure");
    expect(outcomes[0].summary).toEqual({ sent: 2, retried: 0, deadLettered: 0 });
    expect(outcomes[1].summary).toBeNull();
  });

  it("both passes failing still runs both and surfaces a failure", async () => {
    const ran: string[] = [];

    const outcomes = [
      await runPass("outbox drain", (): Promise<unknown> => {
        ran.push("drain");
        throw new Error("drain died");
      }),
      await runPass("task purge", (): Promise<unknown> => {
        ran.push("purge");
        throw new Error("purge died");
      }),
    ];

    expect(ran).toEqual(["drain", "purge"]);
    expect(outcomes.filter((o) => o.error !== null)).toHaveLength(2);
    expect(outcomes.every((o) => o.summary === null)).toBe(true);
  });
});
