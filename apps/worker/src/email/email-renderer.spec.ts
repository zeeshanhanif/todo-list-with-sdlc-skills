import { EmailRenderer } from "./email-renderer";
import type { OutboxRow } from "../outbox/outbox.types";

const renderer = new EmailRenderer({ publicAppUrl: "https://app.todo.test" });

const row = (over: Partial<OutboxRow>): OutboxRow => ({
  id: "id-1",
  type: "verification",
  recipient: "user@example.com",
  payload: { token: "raw-token-123", userId: "u-1" },
  attempts: 1,
  ...over,
});

describe("EmailRenderer", () => {
  it("renders a verification email with the /verify link carrying the token", () => {
    const msg = renderer.render(row({ type: "verification" }));
    expect(msg.to).toBe("user@example.com");
    expect(msg.subject).toBe("Verify your email");
    expect(msg.text).toContain(
      "https://app.todo.test/verify?token=raw-token-123",
    );
  });

  it("renders a password_reset email with the /reset-password link", () => {
    const msg = renderer.render(row({ type: "password_reset" }));
    expect(msg.subject).toBe("Reset your password");
    expect(msg.text).toContain(
      "https://app.todo.test/reset-password?token=raw-token-123",
    );
  });

  it("throws on an unknown outbox type", () => {
    expect(() => renderer.render(row({ type: "mystery" }))).toThrow(
      /Unknown email outbox type/,
    );
  });
});
