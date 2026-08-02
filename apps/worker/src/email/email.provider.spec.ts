import type { WorkerConfig } from "../config";
import { createEmailPort } from "./email.provider";
import { LogEmailPort } from "./log-email.port";
import { SmtpEmailPort } from "./smtp-email.port";

const base: WorkerConfig = {
  databaseUrl: "postgres://x",
  emailProvider: "log",
  smtpUrl: undefined,
  emailFrom: "from@x",
  publicAppUrl: "http://localhost:3000",
  emailMaxAttempts: 5,
  emailBatchSize: 50,
  backoffBaseSeconds: 60,
  backoffCapSeconds: 3600,
  // Not read by the port factory — the job's purge pass owns them (FEAT-020).
  taskRetentionDays: 30,
  purgeBatchSize: 500,
};

describe("createEmailPort (AC-7)", () => {
  it("returns LogEmailPort when EMAIL_PROVIDER=log", () => {
    expect(createEmailPort({ ...base, emailProvider: "log" })).toBeInstanceOf(
      LogEmailPort,
    );
  });

  it("returns SmtpEmailPort when EMAIL_PROVIDER=smtp with an SMTP_URL", () => {
    const port = createEmailPort({
      ...base,
      emailProvider: "smtp",
      smtpUrl: "smtp://localhost:1025",
    });
    expect(port).toBeInstanceOf(SmtpEmailPort);
  });

  it("throws when EMAIL_PROVIDER=smtp but SMTP_URL is missing", () => {
    expect(() =>
      createEmailPort({ ...base, emailProvider: "smtp", smtpUrl: undefined }),
    ).toThrow(/SMTP_URL/);
  });
});
