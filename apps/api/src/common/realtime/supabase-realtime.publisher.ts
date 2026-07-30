import { Injectable, Logger } from '@nestjs/common';
import { REALTIME_CHANGED_EVENT, userChannel } from '@todo/shared';
import { loadConfig } from '../../infra/config';
import { RealtimePublisher } from './realtime.publisher';

/** Consecutive failures that open the breaker (FEAT-019 D3). */
const BREAKER_THRESHOLD = 3;
/** How long the breaker stays open before it allows one probe, in ms. */
const BREAKER_OPEN_MS = 30_000;

/**
 * Publishes the per-user `changed` signal to Supabase Realtime over its
 * Broadcast REST endpoint (ADR-006).
 *
 * **The whole server-side Supabase coupling is this file** — one `fetch` to a
 * documented HTTP endpoint, no SDK (D10). Swapping providers, or falling back
 * to the polling substitute ADR-006 retained, replaces this class and touches
 * nothing else.
 *
 * Three properties matter more than the request itself:
 *
 * 1. **Awaited, not fire-and-forget** (D3). Cloud Run may throttle CPU once a
 *    response is sent, so a detached promise can simply never run — the classic
 *    way a signal quietly stops arriving in production while working locally.
 *    Awaiting keeps the work on allocated CPU, and matches arch §6.2, which
 *    broadcasts before responding.
 * 2. **Hard-capped** by `REALTIME_PUBLISH_TIMEOUT_MS` (default 250), so one sick
 *    dependency cannot spend NFR-PERF-001's 300 ms write budget.
 * 3. **Breakered.** After three consecutive failures it stops trying for 30 s,
 *    then lets exactly one probe through — so a Realtime outage costs writes
 *    nothing at all rather than the cap, every time, forever.
 *
 * Failures are swallowed and logged (the port's contract). The payload never
 * carries anything but a cursor, so nothing here can leak task content (AC-7).
 */
@Injectable()
export class SupabaseRealtimePublisher extends RealtimePublisher {
  private readonly logger = new Logger('Realtime');
  private consecutiveFailures = 0;
  /** Epoch ms until which publishing is skipped; 0 when the breaker is closed. */
  private openUntil = 0;

  async publishChanged(userId: string): Promise<void> {
    const now = Date.now();
    if (this.openUntil > now) return;

    const config = loadConfig();
    const cursor = new Date(now).toISOString();

    try {
      // `?private=true` is how the batch endpoint marks a private-channel
      // broadcast (Supabase's documented REST contract, re-checked 2026-07-29);
      // the flag is NOT a message field. See technical-design §8.
      const res = await fetch(
        `${config.supabaseUrl}/realtime/v1/api/broadcast?private=true`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: config.supabaseServiceRoleKey,
            authorization: `Bearer ${config.supabaseServiceRoleKey}`,
          },
          body: JSON.stringify({
            messages: [
              {
                topic: userChannel(userId),
                event: REALTIME_CHANGED_EVENT,
                payload: { cursor },
              },
            ],
          }),
          signal: AbortSignal.timeout(config.realtimePublishTimeoutMs),
        },
      );

      if (!res.ok) {
        this.onFailure(userId, `http_${res.status}`);
        return;
      }
      // A healthy publish logs nothing — one line per write is noise at 1k
      // concurrent users (NFR-SCAL-001, AC-11).
      this.onSuccess();
    } catch (err) {
      this.onFailure(
        userId,
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      );
    }
  }

  private onSuccess(): void {
    if (this.consecutiveFailures >= BREAKER_THRESHOLD) {
      // The probe got through — say so, since the open transition was logged.
      this.log('warn', { msg: 'realtime breaker closed' });
    }
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  private onFailure(userId: string, reason: string): void {
    this.consecutiveFailures += 1;
    // `reason` is our own classification of the transport failure and `userId`
    // identifies whose signal was lost; neither the key nor the payload is ever
    // logged (AC-8, AC-11).
    this.log('error', {
      msg: 'realtime publish failed',
      reason,
      userId,
      consecutiveFailures: this.consecutiveFailures,
    });

    if (this.consecutiveFailures >= BREAKER_THRESHOLD) {
      this.openUntil = Date.now() + BREAKER_OPEN_MS;
      this.log('warn', {
        msg: 'realtime breaker open',
        forMs: BREAKER_OPEN_MS,
      });
    }
  }

  /** Structured JSON so Cloud Logging ingests it as one event (NFR-OBS-001) —
   * the shape `main.ts` and `AuditService` already emit. */
  private log(level: 'error' | 'warn', fields: Record<string, unknown>): void {
    this.logger[level](JSON.stringify(fields));
  }
}
