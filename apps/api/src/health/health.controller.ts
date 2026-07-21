import { Controller, Get } from '@nestjs/common';
import { type HealthResponse } from '@todo/shared';
import { HealthService } from './health.service';

// GET /healthz — the skeleton's single trivial endpoint and the deployment
// health probe (NFR-OBS-002). Unauthenticated by design (liveness/readiness).
@Controller('healthz')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  get(): Promise<HealthResponse> {
    return this.health.check();
  }
}
