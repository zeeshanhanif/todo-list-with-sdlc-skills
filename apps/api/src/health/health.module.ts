import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

// Health/liveness (NFR-OBS-002). The temporary skeleton DB round-trip proof that
// once sat under /healthz/ping was retired by FEAT-009 (technical-design D7).
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
