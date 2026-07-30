import { Injectable } from '@nestjs/common';
import {
  DISPLAY_NAME_MAX_LENGTH,
  THEME_PREFERENCES,
  type ThemePreference,
  type UpdateProfileRequest,
  type UserProfile,
} from '@todo/shared';
import { ProfileRepository, type ProfilePatch } from './profile.repository';
import {
  DisplayNameInvalidError,
  EmptyProfilePatchError,
  ProfileNotFoundError,
  ThemeInvalidError,
  TimezoneInvalidError,
} from './profile.errors';

/**
 * Profile & settings (FEAT-008 technical-design §5.1) — FR-PROF-001..005.
 *
 * Every method takes the **session** user's id; nothing here accepts a subject
 * from a request body (FR-AUTHZ-004). Validation is the whole of this layer's
 * substance — the repository stores what it is given, so what is *allowed* to be
 * stored is decided here, once.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly profiles: ProfileRepository) {}

  /** The caller's profile (FR-PROF-001). */
  async get(userId: string): Promise<UserProfile> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) {
      throw new ProfileNotFoundError();
    }
    return profile;
  }

  /**
   * Apply a partial update (FR-PROF-002/003/004/005).
   *
   * **Key presence — not value — decides what is written** (technical-design D6).
   * `'displayName' in patch` is true for `{ displayName: null }` and false for an
   * omitted field, which is exactly the distinction the contract rests on;
   * branching on `!== undefined` would collapse it the moment a client sent an
   * explicit `undefined` through some serializer.
   */
  async update(
    userId: string,
    patch: UpdateProfileRequest,
  ): Promise<UserProfile> {
    const write: ProfilePatch = {};

    if ('displayName' in patch) {
      write.displayName = normalizeDisplayName(patch.displayName);
    }
    if ('timezone' in patch) {
      write.timezone = validateTimezone(patch.timezone);
    }
    if ('theme' in patch) {
      write.theme = validateTheme(patch.theme);
    }

    // Nothing recognized survived (an unknown-property body, stripped by the
    // ValidationPipe, arrives here as `{}`). An error, never a silent 200 (D6).
    if (Object.keys(write).length === 0) {
      throw new EmptyProfilePatchError();
    }

    const updated = await this.profiles.update(userId, write);
    if (!updated) {
      throw new ProfileNotFoundError();
    }
    return updated;
  }
}

/**
 * FR-PROF-002: trim, then require non-empty and at most DISPLAY_NAME_MAX_LENGTH.
 *
 * `null` passes straight through — it is the "unset it, use the derived default"
 * value (technical-design D1), and the one input a *blank field in the UI* maps
 * to. `""` is an error (UC-007 alt 3a), which is why the two are not the same.
 */
function normalizeDisplayName(raw: string | null | undefined): string | null {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new DisplayNameInvalidError('Enter a display name.');
  }
  const name = raw.trim();
  if (name.length === 0) {
    throw new DisplayNameInvalidError('Enter a display name.');
  }
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new DisplayNameInvalidError(
      `Keep your display name to ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    );
  }
  // Line breaks and other control characters would render as gaps or nothing at
  // all wherever the name is shown, and a name is a single-line thing.
  if (CONTROL_CHARS.test(name)) {
    throw new DisplayNameInvalidError(
      'Use a single line, without special control characters.',
    );
  }
  return name;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * FR-PROF-003: a zone this runtime's ICU database resolves, stored **verbatim**.
 *
 * Deliberately not canonicalized (technical-design D2): this runtime resolves
 * `Asia/Kolkata` to `Asia/Calcutta` while current browsers resolve the reverse,
 * so normalizing here would hand the settings picker a zone id missing from its
 * own option list. `Intl.supportedValuesOf` is likewise not used as a gate — on
 * this ICU it excludes `UTC`, the system's own fallback.
 */
function validateTimezone(raw: string | undefined): string {
  const invalid = new TimezoneInvalidError('Choose a timezone from the list.');
  if (typeof raw !== 'string' || raw.length === 0) {
    throw invalid;
  }
  // Fixed-offset forms are legal input to Intl and wrong for a person: they are
  // DST-blind, so a user "in +05:30" is an hour off the day their zone shifts.
  // `Etc/GMT±N` is the same thing spelled differently (and sign-inverted).
  if (/^[+-]/.test(raw) || /^Etc\/GMT/i.test(raw)) {
    throw invalid;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw }); // RangeError on nonsense
  } catch {
    throw invalid;
  }
  return raw;
}

/** FR-PROF-004: one of the three stored preferences. `system` is a *preference*,
 * not a resolved value — the client resolves it per device (technical-design D3). */
function validateTheme(raw: unknown): ThemePreference {
  if (!THEME_PREFERENCES.includes(raw as ThemePreference)) {
    throw new ThemeInvalidError('Choose light, dark, or match system.');
  }
  return raw as ThemePreference;
}
