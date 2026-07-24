import { HealthService } from './health.service';

// Liveness is dependency-free (no DB), so this needs no fakes.
describe('HealthService', () => {
  it('reports ok liveness with the service name and an ISO timestamp', () => {
    const result = new HealthService().check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(() => new Date(result.time).toISOString()).not.toThrow();
  });
});
