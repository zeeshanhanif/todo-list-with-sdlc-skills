// The swappable provider boundary (technical-design §3, D1; SW-001, C-7). Domain
// code depends on this port, never on a concrete provider.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailPort {
  /** Deliver the message. Throws on failure (the drain treats that as a retry). */
  send(msg: EmailMessage): Promise<void>;
}

/** DI token for the selected EmailPort implementation. */
export const EMAIL_PORT = "EMAIL_PORT";
