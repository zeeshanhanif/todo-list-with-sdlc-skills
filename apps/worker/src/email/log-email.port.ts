import { Logger } from "@nestjs/common";
import type { EmailMessage, EmailPort } from "./email.port";

/**
 * Default provider (EMAIL_PROVIDER=log): logs the message instead of sending it,
 * so the whole pipeline runs end-to-end in dev/CI with no external account
 * (technical-design D1). Swap to SmtpEmailPort (or a vendor adapter) in prod.
 */
export class LogEmailPort implements EmailPort {
  private readonly logger = new Logger("LogEmailPort");

  async send(msg: EmailMessage): Promise<void> {
    this.logger.log(
      JSON.stringify({
        msg: "email (log provider)",
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      }),
    );
  }
}
