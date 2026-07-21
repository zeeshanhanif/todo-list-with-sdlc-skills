import { Module } from "@nestjs/common";
import { InfraModule } from "./infra/infra.module";
import { HealthModule } from "./health/health.module";

// Root of the NestJS modular monolith (ADR-001). Capability modules
// (auth, profile, lists, tasks, search, account-data) live under ./modules and
// are wired in as their slices are built; cross-cutting concerns under ./common.
// For the walking skeleton only Infra (DB/config) and Health are active —
// Health serves both liveness (/healthz) and the temporary DB round-trip proof
// (/healthz/ping).
@Module({
  imports: [InfraModule, HealthModule],
})
export class AppModule {}
