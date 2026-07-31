import { IsIn, IsString, ValidateIf } from 'class-validator';
import { THEME_PREFERENCES, type ThemePreference } from '@todo/shared';

/**
 * Request body for `PATCH /profile` — the **absent-vs-null** DTO
 * (technical-design D6, inherited from FEAT-011's `UpdateTaskDto`).
 *
 * The trap this shape exists to avoid: `@IsOptional()` skips validation for
 * `null` *and* `undefined`, collapsing exactly the distinction this contract
 * depends on. `@ValidateIf((_, v) => v !== undefined)` validates a present
 * `null` and skips only a genuinely absent field, so:
 *
 * - `displayName` absent → untouched; `null` → unset; `""` → validation error.
 * - `timezone` takes no null (a zone, once established, is not un-established);
 *   the deep rules (ICU resolution, no fixed offsets) live in ProfileService,
 *   which is the single place that decides what a zone *is* (D2).
 * - Anything not declared here is **stripped** by the global ValidationPipe's
 *   `whitelist: true` — including `email` and `id`, which is what makes
 *   FR-AUTHZ-004 structural rather than a check someone must remember.
 */
export class UpdateProfileDto {
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString({ message: 'Enter a display name.' })
  displayName?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'Choose a timezone from the list.' })
  timezone?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(THEME_PREFERENCES, { message: 'Choose light, dark, or match system.' })
  theme?: ThemePreference;
}
