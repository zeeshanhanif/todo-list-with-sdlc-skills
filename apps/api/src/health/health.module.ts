import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { SkeletonService } from './skeleton.service';

// Health/liveness (real, NFR-OBS-002) plus the temporary skeleton DB round-trip
// proof under /healthz/ping. SkeletonService is SCAFFOLDING — delete it (and the
// /healthz/ping route + skeleton_ping table) once the first real slice lands.
@Module({
  controllers: [HealthController],
  providers: [HealthService, SkeletonService],
})
export class HealthModule {}
