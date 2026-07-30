import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { RealtimeTokenResponse, SessionUser } from '@todo/shared';
import { APP_CONFIG, type AppConfig } from '../../infra/config';
import { SessionGuard } from '../authz/session.guard';
import { CurrentUser } from '../authz/current-user.decorator';
import { RealtimeTokenService } from './realtime-token.service';

/**
 * The Realtime block's one HTTP face (FEAT-019 §3.1): connection parameters for
 * the caller's own channel.
 *
 * **It accepts nothing.** No body, no query, no path parameter, no header of
 * ours — the subject comes from `@CurrentUser()` and the channel is derived
 * from that. There is no request shape that makes this mint someone else's
 * channel, which is what makes FR-AUTHZ-002/003 structural here rather than
 * checked (AC-6).
 *
 * A controller under `common/` is unusual in this codebase and deliberate (D2):
 * `realtime` is cross-cutting because `lists` and `tasks` both publish through
 * it, and its endpoint belongs beside its minter rather than in a capability
 * module that owns no capability.
 *
 * Not rate-limited, like every other data endpoint (FR-AUTH-018 / NFR-SEC-006
 * scope throttling to auth); a client mints roughly twice an hour per tab.
 */
@Controller('realtime')
@UseGuards(SessionGuard)
export class RealtimeController {
  constructor(
    private readonly tokens: RealtimeTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('token')
  token(@CurrentUser() user: SessionUser): RealtimeTokenResponse {
    const config = this.config;

    // Unconfigured is the default and is not an error: the client falls back to
    // its adaptive refetch schedule (D4). Nothing is minted and the signing
    // secret is never read, so a half-configured environment cannot hand out a
    // credential that resolves to nothing.
    if (config.realtimeProvider !== 'supabase') return { enabled: false };

    const { token, channel, expiresAt } = this.tokens.mint(user.id);
    return {
      enabled: true,
      url: config.supabaseUrl,
      // Publishable, not service-role. The key that signs broadcasts never
      // leaves the server (D5, AC-8).
      publishableKey: config.supabasePublishableKey,
      token,
      channel,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
