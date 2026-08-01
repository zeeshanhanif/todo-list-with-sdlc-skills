import {
  Controller,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AUTH_ERROR_CODES,
  accountExportFilename,
  type AccountExportDocument,
  type SessionUser,
} from '@todo/shared';
import { SessionGuard } from '../../common/authz/session.guard';
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { AUDIT_EVENTS, AuditService } from '../../common/audit/audit.service';
import { AccountExportService } from './account-export.service';
import { AccountNotFoundError } from './account-data.errors';

// Personal-data export (FR-DATA-001/002) — FEAT-017.
// Authenticated (FR-AUTHZ-001) and operating on the SESSION user only: the
// route takes no body, no path param and no query, so there is no request shape
// that addresses another account (FR-AUTHZ-004) — the same property that lets
// `profile` skip the ownership plumbing `lists` and `tasks` carry.
//
// Deliberately NOT decorated with ChangeSignalInterceptor: this is a read and
// publishes no `changed` signal (contrast ProfileController).
// Not rate-limited: FR-AUTH-018 / NFR-SEC-006 scope throttling to auth
// endpoints (technical-design D10, which records the watch item).
@Controller('account')
@UseGuards(SessionGuard)
export class AccountExportController {
  constructor(
    private readonly exporter: AccountExportService,
    private readonly audit: AuditService,
  ) {}

  /**
   * POST /account/export (FR-DATA-001, FR-DATA-002; UC-015 main 1-3) — matches
   * ACCOUNT_EXPORT_PATH.
   *
   * **The body is the export document itself, with no envelope** — the single
   * deliberate deviation from this API's `{ resource }` wrapper convention
   * (technical-design D2): this body *is* the file the user keeps, so a wrapper
   * would either be written into their file as noise or be stripped by the
   * client, meaning the bytes they receive are not the bytes we sent. Error
   * responses still use the standard ApiError envelope.
   *
   * `POST` for a read-only operation is the plan's verb and D1's decision: a
   * GET URL carrying an entire dataset is bookmarkable, prefetchable, and lands
   * in history and intermediary logs.
   */
  @Post('export')
  @HttpCode(200)
  async export(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountExportDocument> {
    let doc: AccountExportDocument;
    try {
      doc = await this.exporter.export(user.id);
    } catch (err) {
      throw toHttp(err);
    }

    // One filename rule, shared with the client (technical-design D5): the date
    // is the user's local date, not the server's. `?? 'UTC'` is the same
    // fallback the rest of the system applies to a null zone.
    const filename = accountExportFilename(
      doc.exportedAt,
      doc.account.timezone ?? 'UTC',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Best-effort (NFR-SEC-009, technical-design D6): a logging failure must
    // never fail the export the user asked for. `AuditService.record` already
    // swallows its own errors, and this `catch` is deliberately NOT redundant
    // with that — AC-11 makes "an audit failure still returns the document" a
    // property of THIS endpoint, and inheriting it from a collaborator's
    // promise would mean a change over there silently breaks it here.
    // Awaited rather than fired-and-forgotten so the row is durable before the
    // response goes out.
    await this.audit
      .record(AUDIT_EVENTS.dataExported, { userId: user.id })
      .catch(() => undefined);

    return doc;
  }
}

/** Map the module's domain errors onto the designed HTTP responses
 * (technical-design §3.1); the global filter renders the ApiError envelope.
 * Anything unrecognized is returned as-is → 500 internal_error via the filter —
 * which is where ExportIntegrityError deliberately lands. */
function toHttp(err: unknown): unknown {
  if (err instanceof AccountNotFoundError) {
    // The session resolved but the account is gone: to a caller that is the
    // same fact as an invalid session, and a 500 would be a lie (§3.1).
    return new UnauthorizedException({
      code: AUTH_ERROR_CODES.unauthenticated,
      message: 'Sign in to continue.',
    });
  }
  return err;
}
