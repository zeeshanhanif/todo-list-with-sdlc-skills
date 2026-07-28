import { Controller, Get } from '@nestjs/common';
import { type HealthResponse } from '@todo/shared';
import { HealthService } from './health.service';

@Controller('healthz')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // GET /healthz — deployment liveness probe (NFR-OBS-002). Unauthenticated,
  // dependency-free: it must NOT touch the DB (a DB blip must not mark the process
  // dead and get the instance killed). Monitors hit this exact path.
  //
  // The walking skeleton's DB round-trip proof used to live at /healthz/ping;
  // FEAT-009 retired it with the rest of the scaffolding, as scaffold-notes
  // planned for "when the first real slice lands" (technical-design D7).
  @Get()
  get(): HealthResponse {
    return this.health.check();
  }
}
