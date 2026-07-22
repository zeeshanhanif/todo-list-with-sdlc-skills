import type { WorkerConfig } from "../config";
import type { OutboxRow } from "../outbox/outbox.types";
import type { EmailMessage } from "./email.port";

/**
 * Renders an outbox row into an EmailMessage (technical-design §5, D3). Links are
 * built from PUBLIC_APP_URL + a path the target feature serves: /verify (FEAT-002)
 * and /reset-password (FEAT-005). An unknown type throws — the drain treats that
 * as a send failure (retry, then dead-letter), never a silent drop.
 */
export class EmailRenderer {
  constructor(private readonly config: Pick<WorkerConfig, "publicAppUrl">) {}

  render(row: OutboxRow): EmailMessage {
    const token = encodeURIComponent(row.payload.token ?? "");
    switch (row.type) {
      case "verification": {
        const link = `${this.config.publicAppUrl}/verify?token=${token}`;
        return {
          to: row.recipient,
          subject: "Verify your email",
          text: `Welcome to To-Do! Confirm your email to activate your account:\n\n${link}\n\nThis link expires in 24 hours.`,
        };
      }
      case "password_reset": {
        const link = `${this.config.publicAppUrl}/reset-password?token=${token}`;
        return {
          to: row.recipient,
          subject: "Reset your password",
          text: `We received a request to reset your To-Do password:\n\n${link}\n\nThis link expires in 1 hour. If you didn't ask for this, you can ignore it.`,
        };
      }
      default:
        throw new Error(`Unknown email outbox type: ${row.type}`);
    }
  }
}
