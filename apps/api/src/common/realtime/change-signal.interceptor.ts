import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, concatMap, from } from 'rxjs';
import type { AuthenticatedRequest } from '../authz/current-user.decorator';
import { RealtimePublisher } from './realtime.publisher';

/**
 * Emits the per-user `changed` signal after a successful write (ADR-006;
 * FEAT-019 D8).
 *
 * **Why an interceptor rather than ten service calls.** `lists` and `tasks`
 * expose ten mutating routes today and FEAT-014/008/016 will add more. Ten call
 * sites are ten chances to forget; three `@UseInterceptors` lines cover every
 * current *and* future write on those controllers. It also keeps an outbound
 * HTTP concern out of domain services that are otherwise pure.
 *
 * Two behaviours are load-bearing:
 *
 * - **Nothing is published when the handler throws.** A `400`, `401` or `404`
 *   leaves the observable on its error path, which `concatMap` never runs — so
 *   a rejected write cannot tell another device something changed (AC-3).
 * - **The publish is awaited before the response is released** (D3), which is
 *   what keeps it on Cloud Run's allocated CPU and matches arch §6.2's order.
 *   The publisher's own contract caps and swallows, so this never delays a
 *   response by more than the configured timeout and never fails one.
 *
 * `GET` is skipped outright: reads change nothing, and the guard has already
 * resolved `req.user` either way.
 */
@Injectable()
export class ChangeSignalInterceptor implements NestInterceptor {
  constructor(private readonly publisher: RealtimePublisher) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.method === 'GET') return next.handle();

    return next.handle().pipe(
      concatMap((body: unknown) =>
        from(
          (async () => {
            const userId = req.user?.id;
            // No user means the route is not behind SessionGuard — publish
            // nothing rather than guess an owner.
            if (userId) await this.publish(userId);
            return body;
          })(),
        ),
      ),
    );
  }

  /**
   * The port promises never to throw; this does not rely on it.
   *
   * A publisher that breaks its contract would otherwise turn a committed
   * `201` into a `500` — the user's task created, their screen told it failed.
   * The swallow is one line and it is the difference between a sync bug and a
   * data-integrity-looking bug (AC-4).
   */
  private async publish(userId: string): Promise<void> {
    try {
      await this.publisher.publishChanged(userId);
    } catch {
      // Adapters log their own failures with the context to diagnose them
      // (NFR-OBS-001); a second line here would only say "it threw".
    }
  }
}
