"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DISPLAY_NAME_MAX_LENGTH,
  THEME_PREFERENCES,
  displayNameFor,
  type ApiError,
  type ThemePreference,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
  type UserProfile,
} from "@todo/shared";
import { applyTheme, writeThemeCookie } from "@/components/theme-sync";

// SCR-WEB-013 form island (ui-design.md). Consumes PATCH /api/profile (BFF → API).
// States: default, saving, success, error (field + form level), and the
// unauthenticated redirect. Input is preserved on every error (NFR-REL-004).
// All values are design tokens.
//
// Two save behaviours on one screen, and the split is deliberate (ui-design D7):
// a choice from a fixed set is complete the moment it is made, so `select` and
// `radio` save on change; a text field is not complete until the user stops
// typing, so it saves on an explicit Save. Each control PATCHes only its own
// field — which is what the partial contract (technical-design D6) is for.

const labelStyle = {
  display: "block",
  marginBottom: "var(--space-1)",
  fontSize: "var(--font-size-caption)",
  color: "var(--color-text)",
};

const helpStyle = {
  margin: "var(--space-1) 0 0",
  fontSize: "var(--font-size-small)",
  color: "var(--color-text-muted)",
};

const errorStyle = {
  margin: "var(--space-1) 0 0",
  fontSize: "var(--font-size-small)",
  color: "var(--color-danger)",
};

const controlBase = {
  width: "100%",
  height: "var(--size-control-md)",
  padding: "0 var(--space-3)",
  borderRadius: "var(--radius-md)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body)",
  boxSizing: "border-box" as const,
};

/** design.md §2/§5 control-boundary rule: a control identified only by its
 * outline takes `--color-text-muted` (4.8:1 light / 6.6:1 dark), never
 * `--color-border-strong` (1.5:1) — the rule DEF-005 exists to keep. */
const controlBorder = (invalid: boolean) =>
  `var(--border-width-hairline) solid ${
    invalid ? "var(--color-danger)" : "var(--color-text-muted)"
  }`;

const rowStyle = {
  padding: "var(--space-5)",
  borderTop: "var(--border-width-hairline) solid var(--color-border)",
};

type Status = "idle" | "saving" | "saved";

export function ProfileForm({ profile }: { profile: UserProfile }) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [timezone, setTimezone] = useState(profile.timezone ?? "UTC");
  const [theme, setTheme] = useState<ThemePreference>(profile.theme);

  const [status, setStatus] = useState<Status>("idle");
  const [busyField, setBusyField] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // The browser's zone database, grouped by region. ~400 entries in a native
  // select rather than a combobox the design system does not have (ui-design D6):
  // the platform brings type-ahead, a keyboard model and the mobile picker for
  // free, and escalating a new component for one control would be the wrong
  // trade. `useMemo` because the list never changes within a session.
  const zoneGroups = useMemo(() => groupZones(timezone), [timezone]);

  /** The one place a save happens. Sends ONLY the field that changed. */
  async function save(
    field: keyof UpdateProfileRequest,
    body: UpdateProfileRequest,
  ): Promise<boolean> {
    setBusyField(field);
    setStatus("saving");
    setFormError(null);
    setFieldError((prev) => ({ ...prev, [field]: "" }));
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 200) {
        const { profile: saved } = (await res.json()) as UpdateProfileResponse;
        // Render the server's truth, not our optimistic copy.
        setDisplayName(saved.displayName ?? "");
        setTimezone(saved.timezone ?? "UTC");
        setTheme(saved.theme);
        setStatus("saved");
        // Other surfaces (the due chips, the shell) read the profile from the
        // server — refresh so a zone change re-renders them (ui-design D9).
        router.refresh();
        return true;
      }
      if (res.status === 401) {
        // The session went away while the screen was open (ui-design D4).
        router.push("/signin");
        return false;
      }
      const err = (await res.json()) as ApiError;
      const named = err.fields?.find((f) => f.field === field);
      if (named) {
        setFieldError((prev) => ({ ...prev, [field]: named.message }));
      } else {
        setFormError(err.message || "Something went wrong. Please try again.");
      }
      setStatus("idle");
      return false;
    } catch {
      setFormError("Something went wrong. Please try again.");
      setStatus("idle");
      return false;
    } finally {
      setBusyField(null);
    }
  }

  async function onSaveDisplayName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    // A blank field means "unset" — `null`, never `""`, which the contract
    // rejects (ui-design D5 / technical-design D1).
    await save("displayName", { displayName: trimmed === "" ? null : trimmed });
  }

  async function onThemeChange(next: ThemePreference) {
    const previous = theme;
    // Applied optimistically: the theme control is not a preview widget, so the
    // whole product re-themes in the same tick (ui-design D1)...
    setTheme(next);
    applyTheme(next);
    const ok = await save("theme", { theme: next });
    if (ok) {
      writeThemeCookie(next);
    } else {
      // ...and reverts with the error, so the screen never shows a theme the
      // server did not accept.
      setTheme(previous);
      applyTheme(previous);
    }
  }

  const fallbackName = displayNameFor({ displayName: null, email: profile.email });

  return (
    <section
      data-testid="profile-form"
      style={{
        background: "var(--color-surface)",
        border: "var(--border-width-hairline) solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      {formError ? (
        <div
          data-testid="profile-form-error"
          role="alert"
          style={{
            margin: "var(--space-5) var(--space-5) 0",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-danger-subtle)",
            // The tint's PARTNER token — `--color-danger` here would be 3.95:1
            // (design.md §5; the DEF-003/DEF-006 pairing).
            color: "var(--color-danger-text)",
            fontSize: "var(--font-size-small)",
          }}
        >
          {formError}
        </div>
      ) : null}

      {/* --- Email: static text, not a disabled input (ui-design D4) --- */}
      <div style={{ ...rowStyle, borderTop: "none" }}>
        <span style={labelStyle}>Email</span>
        <p
          data-testid="profile-email"
          style={{
            margin: 0,
            color: "var(--color-text)",
            fontSize: "var(--font-size-body)",
          }}
        >
          {profile.email}
        </p>
        <p style={helpStyle}>Your email can&apos;t be changed.</p>
      </div>

      {/* --- Display name: explicit Save (ui-design D7) --- */}
      <form onSubmit={onSaveDisplayName} style={rowStyle}>
        <label htmlFor="displayName" style={labelStyle}>
          Display name
        </label>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={fieldError.displayName ? true : undefined}
            aria-describedby="displayName-help"
            style={{
              ...controlBase,
              border: controlBorder(Boolean(fieldError.displayName)),
            }}
          />
          <button
            type="submit"
            data-testid="save-display-name"
            disabled={busyField === "displayName"}
            style={{
              height: "var(--size-control-md)",
              padding: "0 var(--space-5)",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "var(--color-primary)",
              color: "var(--color-on-primary)",
              fontSize: "var(--font-size-body)",
              cursor: busyField === "displayName" ? "not-allowed" : "pointer",
              opacity: busyField === "displayName" ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {busyField === "displayName" ? "Saving…" : "Save"}
          </button>
        </div>
        {fieldError.displayName ? (
          <p style={errorStyle}>{fieldError.displayName}</p>
        ) : (
          <p id="displayName-help" style={helpStyle}>
            Leave blank to use <strong>{fallbackName}</strong>.
          </p>
        )}
      </form>

      {/* --- Timezone: saves on change (ui-design D7) --- */}
      <div style={rowStyle}>
        <label htmlFor="timezone" style={labelStyle}>
          Timezone
        </label>
        <select
          id="timezone"
          name="timezone"
          value={timezone}
          disabled={busyField === "timezone"}
          onChange={(e) => void save("timezone", { timezone: e.target.value })}
          aria-invalid={fieldError.timezone ? true : undefined}
          style={{
            ...controlBase,
            border: controlBorder(Boolean(fieldError.timezone)),
          }}
        >
          {zoneGroups.map(([region, zones]) => (
            <optgroup key={region} label={region}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.split("/").slice(1).join(" / ").replace(/_/g, " ") ||
                    zone}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {fieldError.timezone ? (
          <p style={errorStyle}>{fieldError.timezone}</p>
        ) : (
          <p style={helpStyle}>Used to show when your tasks are due.</p>
        )}
      </div>

      {/* --- Theme: saves on change and applies immediately (ui-design D1) --- */}
      <fieldset style={{ ...rowStyle, border: "none", margin: 0 }}>
        <legend style={{ ...labelStyle, padding: 0 }}>Theme</legend>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {THEME_PREFERENCES.map((option) => (
            <label
              key={option}
              htmlFor={`theme-${option}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                minHeight: "var(--size-touch-target)",
                color: "var(--color-text)",
                fontSize: "var(--font-size-body)",
                cursor: "pointer",
              }}
            >
              <input
                id={`theme-${option}`}
                type="radio"
                name="theme"
                value={option}
                checked={theme === option}
                disabled={busyField === "theme"}
                onChange={() => void onThemeChange(option)}
                style={{ accentColor: "var(--color-primary)", width: 18, height: 18 }}
              />
              {THEME_LABELS[option]}
            </label>
          ))}
        </div>
        {fieldError.theme ? <p style={errorStyle}>{fieldError.theme}</p> : null}
      </fieldset>

      {/* design.md §5: async results are announced, not just drawn. */}
      <p
        data-testid="profile-status"
        aria-live="polite"
        style={{
          margin: 0,
          padding: "0 var(--space-5) var(--space-5)",
          minHeight: "var(--font-size-body)",
          fontSize: "var(--font-size-small)",
          color:
            status === "saved"
              ? "var(--color-success-text)"
              : "var(--color-text-muted)",
        }}
      >
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
      </p>
    </section>
  );
}

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "Match system",
};

/**
 * The browser's zones, grouped by region prefix, with the account's current zone
 * guaranteed present.
 *
 * That guarantee is the point: the server stores what the user chose without
 * re-canonicalizing it (technical-design D2), and the two ICU databases can
 * spell an alias differently — so a stored `Asia/Calcutta` must not vanish from
 * a list built by a browser that only offers `Asia/Kolkata`. Without this the
 * select would silently fall back to its first option and the next save would
 * change the user's zone behind their back.
 */
function groupZones(current: string): Array<[string, string[]]> {
  const all = new Set<string>(
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [],
  );
  all.add("UTC");
  all.add(current);

  const groups = new Map<string, string[]>();
  for (const zone of [...all].sort()) {
    const region = zone.includes("/") ? zone.split("/")[0] : "Other";
    const bucket = groups.get(region);
    if (bucket) bucket.push(zone);
    else groups.set(region, [zone]);
  }
  return [...groups.entries()];
}
