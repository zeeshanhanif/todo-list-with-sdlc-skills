import * as nodemailer from "nodemailer";
import type { EmailMessage, EmailPort } from "./email.port";

/**
 * SMTP provider (EMAIL_PROVIDER=smtp): sends via nodemailer over TLS (COM-003 /
 * NFR-SEC-001). Portable — any SMTP server, no vendor SDK (C-6). The transporter
 * is injected so tests can pass a jsonTransport (no real server).
 */
export class SmtpEmailPort implements EmailPort {
  constructor(
    private readonly transporter: nodemailer.Transporter,
    private readonly from: string,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
  }
}

/** Build a real SMTP transport from a connection URL (e.g. smtps://user:pass@host:465). */
export function createSmtpTransport(smtpUrl: string): nodemailer.Transporter {
  return nodemailer.createTransport(smtpUrl);
}
