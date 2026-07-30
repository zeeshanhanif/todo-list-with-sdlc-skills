import { Injectable } from '@nestjs/common';
import type { UserProfile } from '@todo/shared';
import { DbService } from '../../infra/db.service';

/** The projection every statement here returns — one constant so the read and the
 * write cannot drift into different shapes (the `TASK_COLUMNS` convention). */
const PROFILE_COLUMNS = 'email, display_name, timezone, theme';

/** The columns a patch may address, mapped to their SQL names. Anything not in
 * this map cannot reach a `SET` clause, whatever arrives in the object. */
const PATCHABLE = {
  displayName: 'display_name',
  timezone: 'timezone',
  theme: 'theme',
} as const;

/** A partial profile update — the keys present are exactly the columns to write
 * (technical-design D6). Spelled out rather than mapped over `PATCHABLE`: a
 * homomorphic mapped type inherits that object's `as const` **readonly**
 * modifiers, which makes every assignment in ProfileService a compile error. */
export type ProfilePatch = {
  displayName?: UserProfile['displayName'];
  timezone?: UserProfile['timezone'];
  theme?: UserProfile['theme'];
};

interface ProfileRow {
  email: string;
  display_name: string | null;
  timezone: string | null;
  theme: string;
}

/**
 * Persistence for the profile fields of `users` (FEAT-008 technical-design §5.1).
 *
 * **Single-subject, keyed on the primary key.** Every statement is
 * `WHERE id = $1` with the *session* user's id — there is no owner parameter to
 * get wrong here, because the row and its owner are the same row
 * (FR-AUTHZ-002/004). A zero-row result returns null; the service decides what
 * that means.
 */
@Injectable()
export class ProfileRepository {
  constructor(private readonly db: DbService) {}

  /** The caller's profile, or null when the account no longer exists. */
  async findByUserId(userId: string): Promise<UserProfile | null> {
    const res = await this.db.query<ProfileRow>(
      `SELECT ${PROFILE_COLUMNS} FROM users WHERE id = $1`,
      [userId],
    );
    return res.rows.length ? toProfile(res.rows[0]) : null;
  }

  /**
   * Apply a partial update and return the profile as stored, or null when the
   * account no longer exists.
   *
   * The `SET` clause is built from **only the keys the patch actually contains**
   * (technical-design D6), which is what keeps a one-field save from blanking the
   * other two — the whole reason the contract is a PATCH. `updated_at` always
   * moves, the established write shape (`ListsRepository.rename`).
   *
   * An empty patch never reaches here: the service rejects it (a `SET` clause of
   * only `updated_at` would be a write that says nothing).
   */
  async update(
    userId: string,
    patch: ProfilePatch,
  ): Promise<UserProfile | null> {
    const assignments: string[] = [];
    const params: unknown[] = [userId];

    for (const [key, column] of Object.entries(PATCHABLE)) {
      if (key in patch) {
        params.push(patch[key as keyof ProfilePatch]);
        assignments.push(`${column} = $${params.length}`);
      }
    }
    if (assignments.length === 0) {
      throw new Error('ProfileRepository.update called with an empty patch');
    }

    const res = await this.db.query<ProfileRow>(
      `UPDATE users
          SET ${assignments.join(', ')}, updated_at = now()
        WHERE id = $1
      RETURNING ${PROFILE_COLUMNS}`,
      params,
    );
    return res.rows.length ? toProfile(res.rows[0]) : null;
  }
}

/** Row → contract. `theme` is `NOT NULL` with a CHECK behind it, so the cast is
 * the constraint's guarantee rather than an assumption (technical-design §4). */
function toProfile(row: ProfileRow): UserProfile {
  return {
    email: row.email,
    displayName: row.display_name,
    timezone: row.timezone,
    theme: row.theme as UserProfile['theme'],
  };
}
