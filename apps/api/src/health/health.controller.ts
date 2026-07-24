import { Controller, Get } from '@nestjs/common';
import { type HealthResponse, type SkeletonPingResponse } from '@todo/shared';
import { HealthService } from './health.service';
import { SkeletonService } from './skeleton.service';

@Controller('healthz')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly skeleton: SkeletonService,
  ) {}

  // GET /healthz — deployment liveness probe (NFR-OBS-002). Unauthenticated,
  // dependency-free: it must NOT touch the DB (a DB blip must not mark the process
  // dead and get the instance killed). Monitors hit this exact path.
  @Get()
  get(): HealthResponse {
    return this.health.check();
  }

  // GET /healthz/ping — SCAFFOLDING. The walking skeleton's DB round-trip proof
  // (write + read), exercised by the web shell and the e2e test. A different,
  // sub-path route that no liveness monitor hits. Remove with SkeletonService
  // once the first real domain slice lands.
  @Get('ping')
  ping(): Promise<SkeletonPingResponse> {
    return this.skeleton.ping();
  }
}
