import { render, screen } from "@testing-library/react";
import type { UserProfile } from "@todo/shared";
import {
  PreferencesProvider,
  usePreferences,
  useTimeZone,
} from "./preferences-provider";

// FEAT-008 T6 — the preference context's fallback behaviour, which is the part
// with a decision in it: the EFFECTIVE timezone is computed, never stored
// (technical-design D2), and a degraded shell still renders dates rather than
// breaking (NFR-REL-004).

function Probe() {
  const zone = useTimeZone();
  const profile = usePreferences();
  return (
    <>
      <span data-testid="zone">{zone}</span>
      <span data-testid="theme">{profile?.theme ?? "none"}</span>
    </>
  );
}

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  email: "ada@example.com",
  displayName: null,
  timezone: null,
  theme: "system",
  ...over,
});

describe("PreferencesProvider", () => {
  it("exposes the stored timezone when one is established", () => {
    render(
      <PreferencesProvider profile={profile({ timezone: "Asia/Kolkata" })}>
        <Probe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("zone")).toHaveTextContent("Asia/Kolkata");
  });

  it("falls back to UTC when the account has no zone yet (D2)", () => {
    render(
      <PreferencesProvider profile={profile({ timezone: null })}>
        <Probe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("zone")).toHaveTextContent("UTC");
  });

  it("falls back to UTC when the profile fetch failed, without breaking (NFR-REL-004)", () => {
    render(
      <PreferencesProvider profile={null}>
        <Probe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("zone")).toHaveTextContent("UTC");
    expect(screen.getByTestId("theme")).toHaveTextContent("none");
  });

  it("passes the stored theme through unresolved — `system` is a preference, not a value (D3)", () => {
    render(
      <PreferencesProvider profile={profile({ theme: "system" })}>
        <Probe />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
  });
});
