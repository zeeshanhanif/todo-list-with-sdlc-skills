import { render, waitFor } from "@testing-library/react";
import type { UserProfile } from "@todo/shared";
import { TimezoneAdoption } from "./timezone-adoption";

// FEAT-008 — AC-7: the browser-detected zone is adopted EXACTLY ONCE, and only
// for an account that has never established one (technical-design D2/§5.2).

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: (...a: unknown[]) => refresh(...a) }),
}));

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  email: "ada@example.com",
  displayName: null,
  timezone: null,
  theme: "system",
  ...over,
});

let fetchMock: jest.Mock;

beforeEach(() => {
  refresh.mockClear();
  fetchMock = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("TimezoneAdoption", () => {
  it("AC-7: PATCHes the detected zone when the account has none", async () => {
    render(<TimezoneAdoption profile={profile({ timezone: null })} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/profile");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("AC-7: does nothing when a zone is already established", async () => {
    render(<TimezoneAdoption profile={profile({ timezone: "Asia/Kolkata" })} />);

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("AC-7: adopts once, not once per render", async () => {
    const p = profile({ timezone: null });
    const { rerender } = render(<TimezoneAdoption profile={p} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The shell re-renders on every navigation; a second request would mean a
    // PATCH on every page view for as long as the server had not caught up.
    rerender(<TimezoneAdoption profile={p} />);
    rerender(<TimezoneAdoption profile={{ ...p }} />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a profile", async () => {
    render(<TimezoneAdoption profile={null} />);

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("stays silent when the adoption fails — the account keeps the UTC fallback", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    render(<TimezoneAdoption profile={profile({ timezone: null })} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled(); // and no error surfaces anywhere
  });
});
