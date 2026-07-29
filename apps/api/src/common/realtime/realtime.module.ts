import { Module } from '@nestjs/common';
import { loadConfig } from '../../infra/config';
import { RealtimePublisher } from './realtime.publisher';
import { NoopRealtimePublisher } from './noop-realtime.publisher';
import { SupabaseRealtimePublisher } from './supabase-realtime.publisher';
import { RealtimeTokenService } from './realtime-token.service';

/**
 * The `realtime` cross-cutting block (architecture §5; FEAT-019 D2).
 *
 * It lives under `common/` rather than `modules/` because **both** `lists` and
 * `tasks` need the publisher, and `no-cross-module` forbids either importing
 * the other's module — a shared outbound port has exactly one legal home. The
 * architecture places it the same way ("Cross-cutting: … `realtime` (per-user
 * change broadcaster)").
 *
 * The adapter is chosen once, at wiring time, from `REALTIME_PROVIDER` — the
 * shape FEAT-007's `EmailPort` factory established. `none` is the default and
 * performs no I/O, so nothing in the system depends on a provisioned project.
 */
@Module({
  providers: [
    RealtimeTokenService,
    NoopRealtimePublisher,
    SupabaseRealtimePublisher,
    {
      provide: RealtimePublisher,
      inject: [NoopRealtimePublisher, SupabaseRealtimePublisher],
      useFactory: (
        noop: NoopRealtimePublisher,
        supabase: SupabaseRealtimePublisher,
      ): RealtimePublisher =>
        loadConfig().realtimeProvider === 'supabase' ? supabase : noop,
    },
  ],
  exports: [RealtimePublisher, RealtimeTokenService],
})
export class RealtimeModule {}
