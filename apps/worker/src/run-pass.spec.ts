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

  it("returns null and logs nothing when the pass succeeds", async () => {
    expect(await runPass("outbox drain", async () => "ok")).toBeNull();
    expect(errors).toHaveLength(0);
  });

  it("captures a thrown failure instead of propagating it, and logs it structured", async () => {
    const boom = new Error("provider down");

    const result = await runPass("outbox drain", () => Promise.reject(boom));

    expect(result).toBe(boom);
    expect(errors).toHaveLength(1);
    expect(JSON.parse(errors[0])).toEqual({
      msg: "outbox drain pass failed",
      error: "provider down",
    });
  });

  it("wraps a non-Error rejection so the caller always gets an Error", async () => {
    const result = await runPass("task purge", () => Promise.reject("nope"));

    expect(result).toBeInstanceOf(Error);
    expect(result?.message).toBe("nope");
  });

  it("a failing first pass does not stop the second, and the run still reports failure", async () => {
    const ran: string[] = [];

    // Exactly main.ts's composition: both passes attempt, in order.
    const failures = [
      await runPass("outbox drain", () => {
        ran.push("drain");
        throw new Error("INJECTED drain failure");
      }),
      await runPass("task purge", async () => {
        ran.push("purge");
      }),
    ];

    expect(ran).toEqual(["drain", "purge"]); // the purge ran anyway
    expect(failures.filter((f) => f !== null)).toHaveLength(1);
    expect(failures.find((f) => f !== null)?.message).toBe(
      "INJECTED drain failure",
    );
  });

  it("a failing second pass does not retroactively skip the first, and still reports failure", async () => {
    const ran: string[] = [];

    const failures = [
      await runPass("outbox drain", async () => {
        ran.push("drain");
      }),
      await runPass("task purge", () => {
        ran.push("purge");
        throw new Error("INJECTED purge failure");
      }),
    ];

    expect(ran).toEqual(["drain", "purge"]);
    expect(failures.find((f) => f !== null)?.message).toBe(
      "INJECTED purge failure",
    );
  });

  it("both passes failing still runs both and surfaces a failure", async () => {
    const ran: string[] = [];

    const failures = [
      await runPass("outbox drain", () => {
        ran.push("drain");
        throw new Error("drain died");
      }),
      await runPass("task purge", () => {
        ran.push("purge");
        throw new Error("purge died");
      }),
    ];

    expect(ran).toEqual(["drain", "purge"]);
    expect(failures.filter((f) => f !== null)).toHaveLength(2);
  });
});
