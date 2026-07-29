import { Injectable } from '@nestjs/common';
import { RealtimePublisher } from './realtime.publisher';

/**
 * The default publisher (`REALTIME_PROVIDER=none`) — and, until a Supabase
 * project is provisioned, the one every environment uses: local dev, CI, the
 * api suite and the E2E stack (FEAT-019 technical-design §8).
 *
 * It performs **no I/O at all** — not a fetch, not a log line. A signal that
 * cannot be delivered is not an error worth a line per write at 1k concurrent
 * users (NFR-SCAL-001, AC-11); the web client already knows to fall back to its
 * adaptive refetch schedule, which is what keeps NFR-PERF-004 satisfied without
 * a socket (D4).
 *
 * Mirrors FEAT-007's `LogEmailPort`: the whole pipeline runs with no external
 * account, so nothing about this feature is unrunnable before provisioning.
 */
@Injectable()
export class NoopRealtimePublisher extends RealtimePublisher {
  publishChanged(): Promise<void> {
    return Promise.resolve();
  }
}
