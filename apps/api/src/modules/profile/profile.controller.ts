import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  AUTH_ERROR_CODES,
  PROFILE_ERROR_CODES,
  type ProfileResponse,
  type SessionUser,
  type UpdateProfileResponse,
} from '@todo/shared';
import { SessionGuard } from '../../common/authz/session.guard';
import { CurrentUser } from '../../common/authz/current-user.decorator';
import { ChangeSignalInterceptor } from '../../common/realtime/change-signal.interceptor';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  DisplayNameInvalidError,
  EmptyProfilePatchError,
  ProfileNotFoundError,
  ThemeInvalidError,
  TimezoneInvalidError,
} from './profile.errors';

// Profile & settings endpoints (FR-PROF-*) — FEAT-008.
// Both routes are authenticated (FR-AUTHZ-001) and operate on the SESSION user
// only: there is no id in the path, the query or the body, so there is no
// request shape that addresses another account (FR-AUTHZ-004). That is why this
// controller needs none of the ownership plumbing `lists` and `tasks` carry —
// the row and its owner are the same row.
// Not rate-limited: FR-AUTH-018 / NFR-SEC-006 scope throttling to auth endpoints.
@Controller('profile')
@UseGuards(SessionGuard)
@UseInterceptors(ChangeSignalInterceptor)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  // GET /profile (FR-PROF-001; UC-007 main 1-2) — matches PROFILE_PATH.
  @Get()
  async get(@CurrentUser() user: SessionUser): Promise<ProfileResponse> {
    try {
      return { profile: await this.profile.get(user.id) };
    } catch (err) {
      throw toHttp(err);
    }
  }

  // PATCH /profile (FR-PROF-002/003/004/005; UC-007 main 3-4, alt 3a/4a).
  // Partial: absent leaves a field alone, `null` unsets the display name, and a
  // body with no recognized field is a 400 rather than a silent no-op (D6).
  // A successful write publishes the per-user `changed` signal via the
  // interceptor, so another signed-in device picks the preference up (FR-PROF-005).
  @Patch()
  @HttpCode(200)
  async update(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: SessionUser,
  ): Promise<UpdateProfileResponse> {
    try {
      return { profile: await this.profile.update(user.id, dto) };
    } catch (err) {
      throw toHttp(err);
    }
  }
}

/** Map the module's domain errors onto the designed HTTP responses
 * (technical-design §3); the global filter renders the ApiError envelope.
 * Anything unrecognized is returned as-is → 500 internal_error via the filter. */
function toHttp(err: unknown): unknown {
  if (err instanceof DisplayNameInvalidError) {
    return validationFailed('displayName', err.requirement);
  }
  if (err instanceof TimezoneInvalidError) {
    return validationFailed('timezone', err.requirement);
  }
  if (err instanceof ThemeInvalidError) {
    return validationFailed('theme', err.requirement);
  }
  if (err instanceof EmptyProfilePatchError) {
    // The synthetic field `_` names the body itself rather than any one field
    // (technical-design §3.2) — there is no field to attach this to, and the
    // client needs somewhere to render it.
    return validationFailed(PROFILE_ERROR_CODES.emptyPatchField, err.message);
  }
  if (err instanceof ProfileNotFoundError) {
    // The session resolved but the account is gone: to a caller that is the
    // same fact as an invalid session, and a 500 would be a lie (§3.1).
    return new UnauthorizedException({
      code: AUTH_ERROR_CODES.unauthenticated,
      message: 'Sign in to continue.',
    });
  }
  return err;
}

function validationFailed(field: string, message: string): BadRequestException {
  return new BadRequestException({
    code: 'validation_failed',
    message: 'Validation failed.',
    fields: [{ field, message }],
  });
}
