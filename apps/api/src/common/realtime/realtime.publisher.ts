/**
 * The outbound sync port (ADR-006; FEAT-019 technical-design §5).
 *
 * One operation, because the signal says only *that* something changed for a
 * user — never what. Everything a client wants to know it re-reads through the
 * authenticated API, which stays the sole enforcer of ownership.
 *
 * **Contract: never throws, never blocks past its configured cap.** The write
 * this follows is already committed; sync is an optimization, so a Realtime
 * outage degrades latency and never the operation (arch §8 resilience,
 * NFR-REL-004). This is the same best-effort contract `AuditService` keeps,
 * for a weaker reason: audit is a record, sync is a convenience.
 */
export abstract class RealtimePublisher {
  abstract publishChanged(userId: string): Promise<void>;
}
