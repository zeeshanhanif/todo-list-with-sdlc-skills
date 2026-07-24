import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@todo/shared';

/**
 * Liveness (NFR-OBS-002): answers "is the process up and serving?" with no
 * external dependencies — intentionally does NOT touch Postgres, so uptime
 * monitoring neither depends on nor loads the database. The skeleton's DB
 * round-trip proof lives separately in SkeletonService (GET /skeleton/ping).
 */
@Injectable()
export class HealthService {
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      time: new Date().toISOString(),
    };
  }
}
