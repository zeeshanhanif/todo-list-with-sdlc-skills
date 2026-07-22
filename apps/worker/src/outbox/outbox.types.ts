// A row claimed from email_outbox for delivery (technical-design §5). `type` is a
// plain string (the DB may hold a type the worker doesn't recognize → the renderer
// throws → the row retries/dead-letters honestly).
export interface OutboxRow {
  id: string;
  type: string;
  recipient: string;
  payload: { token?: string; userId?: string } & Record<string, unknown>;
  attempts: number;
}
