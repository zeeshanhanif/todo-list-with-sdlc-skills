import { Logger } from "@nestjs/common";
import { LogEmailPort } from "./log-email.port";

describe("LogEmailPort", () => {
  it("captures the message by logging its recipient and subject", async () => {
    const spy = jest.spyOn(Logger.prototype, "log").mockImplementation();
    await new LogEmailPort().send({
      to: "a@b.com",
      subject: "Hello",
      text: "body",
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("a@b.com"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Hello"));
    spy.mockRestore();
  });
});
