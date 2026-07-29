import { Module } from '@nestjs/common';
import { InfraModule } from './infra/infra.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ListsModule } from './modules/lists/lists.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { RealtimeModule } from './common/realtime/realtime.module';

// Root of the NestJS modular monolith (ADR-001). Capability modules
// (auth, profile, lists, tasks, search, account-data) live under ./modules and
// are wired in as their slices are built; cross-cutting concerns under ./common.
// Active: Infra (DB/config), Health (liveness /healthz), Auth (FEAT-001..006),
// Lists (FEAT-009), Tasks (FEAT-010) and Realtime (FEAT-019 — cross-cutting:
// the change-signal publisher lists/tasks emit through, plus its token endpoint).
@Module({
  imports: [
    InfraModule,
    HealthModule,
    AuthModule,
    ListsModule,
    TasksModule,
    RealtimeModule,
  ],
})
export class AppModule {}
