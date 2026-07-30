import { DISPLAY_NAME_MAX_LENGTH, type UserProfile } from '@todo/shared';
import { ProfileService } from './profile.service';
import type { ProfilePatch, ProfileRepository } from './profile.repository';
import {
  DisplayNameInvalidError,
  EmptyProfilePatchError,
  ProfileNotFoundError,
  ThemeInvalidError,
  TimezoneInvalidError,
} from './profile.errors';

// FEAT-008 T4 — ProfileService validation. Unit tests against a stub repository,
// because the point of every case here is *what reaches persistence* (or that
// nothing does): AC-3/AC-4/AC-5 (display name), AC-6 (timezone, verbatim),
// AC-10 (theme), AC-13 (the empty patch). Persistence itself is T3's.
const STORED: UserProfile = {
  email: 'ada@example.com',
  displayName: null,
  timezone: null,
  theme: 'system',
};

/** Records what the service asked the repository to write. */
function stubRepo() {
  const calls: ProfilePatch[] = [];
  const repo = {
    findByUserId: jest.fn(() => Promise.resolve(STORED)),
    update: jest.fn((_userId: string, patch: ProfilePatch) => {
      calls.push(patch);
      return Promise.resolve({ ...STORED, ...patch });
    }),
  };
  return { repo: repo as unknown as ProfileRepository, calls, spies: repo };
}

const USER = '11111111-1111-4111-8111-111111111111';

describe('ProfileService', () => {
  describe('get', () => {
    it('AC-1: returns the stored profile', async () => {
      const { repo } = stubRepo();
      await expect(new ProfileService(repo).get(USER)).resolves.toEqual(STORED);
    });

    it('maps a missing row to ProfileNotFoundError (→ 401, design §3.1)', async () => {
      const { repo, spies } = stubRepo();
      spies.findByUserId.mockResolvedValueOnce(
        null as unknown as typeof STORED,
      );
      await expect(new ProfileService(repo).get(USER)).rejects.toBeInstanceOf(
        ProfileNotFoundError,
      );
    });
  });

  describe('display name (FR-PROF-002)', () => {
    it('AC-3: trims before storing', async () => {
      const { repo, calls } = stubRepo();

      const out = await new ProfileService(repo).update(USER, {
        displayName: '  Ada  ',
      });

      expect(calls).toEqual([{ displayName: 'Ada' }]);
      expect(out.displayName).toBe('Ada');
    });

    it.each([
      ['empty', ''],
      ['whitespace only', '   '],
      ['one over the maximum', 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)],
      ['a line break', 'Ada\nLovelace'],
      ['an embedded control character', 'Ada\u0007Lovelace'],
    ])('AC-4: rejects %s and writes nothing', async (_label, value: string) => {
      const { repo, spies } = stubRepo();

      await expect(
        new ProfileService(repo).update(USER, { displayName: value }),
      ).rejects.toBeInstanceOf(DisplayNameInvalidError);
      expect(spies.update).not.toHaveBeenCalled();
    });

    it('AC-4: accepts a name of exactly the maximum length', async () => {
      const { repo, calls } = stubRepo();
      const name = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH);

      await new ProfileService(repo).update(USER, { displayName: name });

      expect(calls).toEqual([{ displayName: name }]);
    });

    it('AC-5/D1: null unsets — it is a value, not a validation failure', async () => {
      const { repo, calls } = stubRepo();

      const out = await new ProfileService(repo).update(USER, {
        displayName: null,
      });

      expect(calls).toEqual([{ displayName: null }]);
      expect(out.displayName).toBeNull();
    });
  });

  describe('timezone (FR-PROF-003)', () => {
    it.each(['Asia/Kolkata', 'Asia/Calcutta', 'America/New_York', 'UTC'])(
      'AC-6/D2: stores %s byte-identical to the input',
      async (zone) => {
        const { repo, calls } = stubRepo();

        await new ProfileService(repo).update(USER, { timezone: zone });

        // The assertion that matters: not "a valid zone was stored" but "THIS
        // string was stored". A canonicalizing service passes the first and
        // fails this one (D2).
        expect(calls).toEqual([{ timezone: zone }]);
      },
    );

    it.each([
      ['an unknown zone', 'Mars/Olympus'],
      ['an empty string', ''],
      ['a fixed offset', '+05:30'],
      ['a negative fixed offset', '-08:00'],
      ['an Etc/GMT offset zone', 'Etc/GMT+5'],
      ['null', null as unknown as string],
    ])('AC-6: rejects %s and writes nothing', async (_label, zone) => {
      const { repo, spies } = stubRepo();

      await expect(
        new ProfileService(repo).update(USER, { timezone: zone }),
      ).rejects.toBeInstanceOf(TimezoneInvalidError);
      expect(spies.update).not.toHaveBeenCalled();
    });
  });

  describe('theme (FR-PROF-004)', () => {
    it.each(['light', 'dark', 'system'] as const)(
      'AC-10: accepts %s',
      async (theme) => {
        const { repo, calls } = stubRepo();

        await new ProfileService(repo).update(USER, { theme });

        expect(calls).toEqual([{ theme }]);
      },
    );

    it.each(['neon', 'Dark', '', null])(
      'AC-10: rejects %p and writes nothing',
      async (theme) => {
        const { repo, spies } = stubRepo();

        await expect(
          new ProfileService(repo).update(USER, {
            theme: theme as 'light',
          }),
        ).rejects.toBeInstanceOf(ThemeInvalidError);
        expect(spies.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('patch semantics (D6)', () => {
    it('AC-13: an empty body is an error, not a no-op', async () => {
      const { repo, spies } = stubRepo();

      await expect(
        new ProfileService(repo).update(USER, {}),
      ).rejects.toBeInstanceOf(EmptyProfilePatchError);
      expect(spies.update).not.toHaveBeenCalled();
    });

    it('AC-13: a body of only unknown keys reaches here as {} and is the same error', async () => {
      const { repo, spies } = stubRepo();

      // What the ValidationPipe's `whitelist: true` leaves of `{ timeZone: … }`
      // — the typo that would otherwise return 200 having changed nothing.
      await expect(
        new ProfileService(repo).update(USER, {}),
      ).rejects.toBeInstanceOf(EmptyProfilePatchError);
      expect(spies.update).not.toHaveBeenCalled();
    });

    it('AC-13: writes only the keys the patch carried', async () => {
      const { repo, calls } = stubRepo();

      await new ProfileService(repo).update(USER, { theme: 'dark' });

      expect(calls).toEqual([{ theme: 'dark' }]);
      expect(Object.keys(calls[0])).toEqual(['theme']); // not displayName/timezone
    });

    it('AC-13: validates every field before writing any of them', async () => {
      const { repo, spies } = stubRepo();

      // A valid theme alongside an invalid zone must write NEITHER — a partial
      // application would leave the user with half a save and no way to tell.
      await expect(
        new ProfileService(repo).update(USER, {
          theme: 'dark',
          timezone: 'Mars/Olympus',
        }),
      ).rejects.toBeInstanceOf(TimezoneInvalidError);
      expect(spies.update).not.toHaveBeenCalled();
    });

    it('maps a vanished account to ProfileNotFoundError', async () => {
      const { repo, spies } = stubRepo();
      spies.update.mockResolvedValueOnce(null as unknown as UserProfile);

      await expect(
        new ProfileService(repo).update(USER, { theme: 'dark' }),
      ).rejects.toBeInstanceOf(ProfileNotFoundError);
    });
  });
});
