import type { WorkerConfig } from "../config";
import type { EmailPort } from "./email.port";
import { LogEmailPort } from "./log-email.port";
import { SmtpEmailPort, createSmtpTransport } from "./smtp-email.port";

/** Select the EmailPort implementation from config (technical-design §5, D1). */
export function createEmailPort(config: WorkerConfig): EmailPort {
  if (config.emailProvider === "smtp") {
    if (!config.smtpUrl) {
      throw new Error("SMTP_URL is required when EMAIL_PROVIDER=smtp");
    }
    return new SmtpEmailPort(
      createSmtpTransport(config.smtpUrl),
      config.emailFrom,
    );
  }
  return new LogEmailPort();
}
