# Tasks: FEAT-008 — View/edit profile (display name, timezone, theme)

> Executes: docs/features/FEAT-008-profile/technical-design.md
> Status: pending · Last updated: 2026-07-30
> Notes: **This feature mints the `profile` module** — the first new API module
> since FEAT-010. `apps/api/src/modules/lists/` is the closest structural model
> (controller + service + repository + errors + dto, framework-free domain
> errors, `toHttp` in the controller); copy its *shape*, not its content.
> **The three design subtleties to hold onto:** (1) `null` and *absent* are
> different values on the PATCH, and the **empty patch is a `400`**, not a no-op
> (D6 — inherited verbatim from FEAT-011 D4, including the
> `@ValidateIf((_, v) => v !== undefined)` DTO trick, because `whitelist: true`
> silently strips a misspelled field); (2) the display-name default is **derived
> at read time and never stored** (D1), so nothing backfills `display_name`;
> (3) **`isOverdue` is not touched** — overdue is timezone-invariant and
> FEAT-011 owns its single derivation (D4), so a timezone change must leave
> every `isOverdue` byte-identical (T9's AC-9).
> Architecture names no critical E2E flows/frameworks → no *mandatory* Playwright
> task; T10 exists for the same reason FEAT-010/011/012's did — UC-007 is a whole
> user-visible flow this feature completes end to end.
> Behavioral tasks follow the established Jest + supertest patterns
> (`modules/lists/lists.controller.spec.ts` is the closest model for T5;
> `lib/due-date.spec.ts` is the model for T9's pure-function tests).
> **Run the api suite serially while DEF-002 is open** —
> `npm test -w @todo/api -- --runInBand`. A red parallel run must be re-checked
> serially before it is treated as this feature's regression (design §8).
> **DEF-006 is open on the danger-alert pairing**: any new alert this feature
> renders uses `--color-danger-text`, never `--color-danger`, on
> `--color-danger-subtle` (design §8, AC-16). Do not copy the alert markup out of
> `app/signin/page.tsx` — it carries the defect.
> `apps/web/AGENTS.md`: read `node_modules/next/dist/docs/` before writing web code.

- [ ] T1 — Shared contracts (`@todo/shared`, design §3): a FEAT-008 block adding
      `PROFILE_PATH`, `THEME_PREFERENCES` (`["light","dark","system"] as const`)
      + `ThemePreference`, `DISPLAY_NAME_MAX_LENGTH` (80), `UserProfile`,
      `ProfileResponse`, `UpdateProfileRequest`, `UpdateProfileResponse`, and the
      derived-default helper `displayNameFor({ displayName, email })` (D1 — the
      one rule both tiers render the fallback with).
      Done when: `npm run build:shared` succeeds, api + web typecheck against the
      new symbols, and **no existing exported shape changes** — `SessionUser` in
      particular stays `{ id, email }` (D7).

- [ ] T2 — Migration `1721570000000_profile-preferences.js` (design §4;
      FR-PROF-002/003/004): `display_name text` (nullable), `timezone text`
      (nullable), `theme text NOT NULL DEFAULT 'system'`, plus
      `users_theme_check`. No index (design §4).
      Done when: `npm run db:migrate` applies clean, `down` reverses it clean
      (constraint dropped before its column), and re-applying is clean — verified
      against the current schema at migration 009.

- [ ] T3 — Domain: `ProfileRepository` (design §5.1; FR-PROF-001/005,
      FR-AUTHZ-002). `findByUserId(userId)` and `update(userId, patch)`, both
      keyed on the primary key, both projecting one shared `PROFILE_COLUMNS`
      constant (`email, display_name, timezone, theme`). The `SET` clause is
      built from **only the keys the patch actually contains** (D6), always with
      `updated_at = now()`; a zero-row result returns null rather than throwing.
      Done when: integration tests pass for AC-1 (the row round-trips all four
      fields), AC-13 (a one-key patch leaves the other two columns **and** any
      unrelated `users` column — `email`, `password_hash` — untouched, asserted
      at the row), and a patch for an unknown user id returns null without
      writing.

- [ ] T4 — Domain: `ProfileService` + `profile.errors.ts` (design §5.1;
      FR-PROF-002/003/004). `normalizeDisplayName` (trim → non-empty → ≤ 80 → no
      control characters/line breaks), `validateTimezone` (the rule in design
      §5.1 — resolves through `Intl`, no fixed-offset form, **stored verbatim**;
      do **not** canonicalize, D2), theme membership
      against `THEME_PREFERENCES`, and the empty-patch rule; errors carry
      `requirement` messages like `ListNameInvalidError` does.
      Done when: unit tests pass for AC-3 (trimmed value stored), AC-4 (`""`,
      `"   "`, 81 chars, `"a\nb"` and a string with an
      embedded control character (`"a\u0007b"`) each throw
      `DisplayNameInvalidError` and nothing reaches the repository), AC-5
      (`null` unsets and is **not** a validation error), AC-6 (`Asia/Kolkata`,
      `Asia/Calcutta`, `America/New_York` and `UTC` each stored **byte-identical
      to the input**; `Mars/Olympus`, `""`, `"+05:30"`, `"Etc/GMT+5"`, `null`
      each throw `TimezoneInvalidError`), AC-10 (each of the three themes accepted, anything
      else throws), and AC-13 (`{}` throws `EmptyProfilePatchError`).

- [ ] T5 — Contract: `ProfileController` + `dto/update-profile.dto.ts` +
      `profile.module.ts`, registered in `app.module.ts` (design §3, §5.1).
      Class-level `@UseGuards(SessionGuard)` **and**
      `@UseInterceptors(ChangeSignalInterceptor)`; `GET` and `PATCH` at
      `/profile`; `toHttp` mapping the four domain errors onto the designed
      responses; the DTO using `@ValidateIf((_, v) => v !== undefined)` so `null`
      survives class-validator (D6).
      Done when: supertest contract tests pass for AC-1 (`200 { profile }` for
      the session's own user), AC-2 (a body of `{ email }` alone → the empty-patch
      `400`; `{ email, displayName }` → only the display name moves, email
      unchanged in the response **and** in a follow-up `GET`), AC-4/AC-6/AC-10
      (each `400 validation_failed` naming the right field in `fields[]`, with a
      follow-up `GET` proving nothing was written), AC-13 (`{}`,
      `{ nickname: "x" }` → `400` field `_`, `updated_at` unmoved), AC-14 (`401
      unauthenticated` on **both** routes for missing/expired/revoked cookies,
      nothing written), and AC-15 (**exactly one** `DbService` query per route,
      inside the 300 ms bound) — each rendering the `ApiError` envelope.

- [ ] T6 — Web wiring: `lib/profile.ts` (`fetchProfile()`, mirroring
      `lib/lists.ts`), `app/api/profile/route.ts` (BFF `GET` + `PATCH`, cookie
      forwarded, status + JSON relayed verbatim), `components/app-shell.tsx`
      fetching the profile in the **same `Promise.all`** as the lists (D7), and
      the new `components/preferences-provider.tsx` context + `useTimeZone()`
      hosted in `shell-frame.tsx` (design §5.2).
      Done when: an authenticated page renders with the provider populated from
      the server-fetched profile (no client round-trip on first paint, no added
      serial latency — the two fetches are concurrent), `useTimeZone()` returns
      `timezone ?? "UTC"`, and a failed profile fetch degrades to the same
      `"UTC"` default without stranding the shell (NFR-REL-004).

- [ ] T7 — Web: theme application (design §5.2, D3; FR-PROF-004). The
      pre-paint inline `<script>` in `app/layout.tsx` (reads the `theme` cookie,
      resolves `system` via `matchMedia`, sets `data-theme` on
      `documentElement`), `components/theme-sync.tsx` (applies + re-mirrors the
      cookie from the server-fetched profile, and keeps following OS changes
      while `system` is selected), and clearing the mirror in
      `components/sign-out-button.tsx`.
      Done when: AC-11 holds — a `theme: "dark"` account's authenticated screens
      carry `data-theme="dark"` on `<html>` **at first paint** with no
      light-themed flash (asserted against the pre-hydration document, not the
      settled DOM); `system` resolves to the OS preference and switches live when
      the OS preference changes with no reload; and signing out leaves no `theme`
      cookie behind.

- [ ] T8 — UI integration point (design §5.2): `app/settings/profile/page.tsx`
      (SCR-WEB-013) + `components/profile-form.tsx` client island consuming
      `PATCH /api/profile`, and the `Settings` nav target moving to
      `/settings/profile` with reciprocal links between the two settings screens
      (D5). Screens are ui-design's manifest; this task is the contract wiring.
      Done when: AC-1 (email rendered read-only, not an input), AC-3 (saving a
      display name persists and survives a fresh session), AC-5 (clearing it
      falls back to the email local part via `displayNameFor`), AC-6 (choosing a
      zone persists), AC-10 (choosing a theme persists and applies immediately),
      AC-16 (default/saving/success/error states; the field error from
      `fields[]` shown inline with input preserved; every control keyboard-
      operable with a visible focus ring) — and the sidebar's Settings item
      reaches SCR-WEB-013 with SCR-WEB-014 one click away.

- [ ] T9 — Web: `lib/due-date.ts` becomes zone-explicit and its four consumers
      pass the profile zone (design §5.3; FR-PROF-003, NFR-LOC-001).
      `zonedParts` + the two-pass offset solve in `fromDateTimeLocalValue`;
      `task-meta.tsx`, `task-detail.tsx` and `quick-add.tsx` reading
      `useTimeZone()`. **`isOverdue` is not touched** (D4).
      Done when: AC-8 passes as pure-function tests (an instant renders the same
      wall clock under a `Asia/Kolkata` profile zone regardless of the machine's
      `TZ`; `2026-03-01T09:00` in `Asia/Kolkata` → `2026-03-01T03:30:00.000Z`;
      a half-hour zone and an `America/New_York` DST-transition value each
      round-trip through `toDateTimeLocalValue`/`fromDateTimeLocalValue`
      unchanged) **and** AC-9 passes (a task list read before and after a
      `PATCH { timezone }` returns byte-identical `isOverdue` values).

- [ ] T10 — E2E: extend `e2e/tests/` with the path this feature completes — sign
      in → open Settings → set a display name, a timezone and the dark theme →
      the UI re-themes without a reload → reload and the settings are still
      there → a task's due chip reads in the chosen zone. [UC-007]
      Done when: `npm run test:e2e` passes against the local stack (Docker + DB
      up), with the FEAT-009..013 and FEAT-019 specs still green.

- [ ] T11 — Verify: acceptance criteria AC-1..AC-16 (design §6) demonstrably
      pass; AC-12 (cross-device persistence + the `changed` signal on a second
      open device) demonstrated explicitly, since no earlier task owns it;
      `src/modules/README.md` and `app.module.ts`'s module comment updated to
      show `profile` as built (design §5.4); `npm run boundaries`, `npm run
      lint`, `npm run build`, and the api + shared + web + e2e suites green — the
      api suite **serially** while DEF-002 is open, with any parallel failure
      re-checked serially before it is attributed to this feature.
      Done when: the full feature suite passes and the checklist above is
      satisfied.
