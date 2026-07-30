import { render } from "@testing-library/react";
import {
  applyTheme,
  clearThemeCookie,
  resolveTheme,
  ThemeSync,
  THEME_COOKIE,
  writeThemeCookie,
} from "./theme-sync";

// FEAT-008 T7 — theme application (AC-11). The pre-paint half is asserted in the
// E2E suite, where a real document exists to paint; this file covers the
// reconciliation half: what gets applied, what gets mirrored, and — the part
// with a real decision in it — that only `system` follows the OS.

/** Drive `matchMedia` the way jsdom does not by default. */
function mockPrefersDark(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: jest.fn().mockReturnValue(media),
  });
  return {
    /** Simulate the OS flipping while the app is open. */
    flip(next: boolean) {
      media.matches = next;
      listeners.forEach((fn) => fn());
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

const themeAttr = () => document.documentElement.dataset.theme;

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
});

describe("resolveTheme", () => {
  it("passes an explicit preference through untouched", () => {
    mockPrefersDark(true);
    expect(resolveTheme("light")).toBe("light"); // not overridden by the OS
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves `system` against the OS preference (D3)", () => {
    mockPrefersDark(true);
    expect(resolveTheme("system")).toBe("dark");
    mockPrefersDark(false);
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("applyTheme", () => {
  it('sets data-theme on :root — design.md §8\'s mechanism', () => {
    mockPrefersDark(false);
    applyTheme("dark");
    expect(themeAttr()).toBe("dark");
    applyTheme("system");
    expect(themeAttr()).toBe("light");
  });
});

describe("the cookie mirror", () => {
  it("writes the PREFERENCE, not the resolved value", () => {
    mockPrefersDark(true);
    writeThemeCookie("system");
    // Storing "dark" here would freeze a `system` user's choice the first time
    // their OS happened to be dark.
    expect(document.cookie).toContain(`${THEME_COOKIE}=system`);
  });

  it("clears on sign-out so a preference cannot outlive its session", () => {
    writeThemeCookie("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);

    clearThemeCookie();

    expect(document.cookie).not.toContain(`${THEME_COOKIE}=dark`);
  });
});

describe("ThemeSync", () => {
  it("AC-11: applies the account's theme and mirrors it", () => {
    mockPrefersDark(false);

    render(<ThemeSync theme="dark" />);

    expect(themeAttr()).toBe("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);
  });

  it("AC-11: `system` follows a live OS change, with no reload", () => {
    const os = mockPrefersDark(false);
    render(<ThemeSync theme="system" />);
    expect(themeAttr()).toBe("light");

    os.flip(true);

    expect(themeAttr()).toBe("dark");
  });

  it("AC-11: an explicit choice does NOT follow the OS", () => {
    const os = mockPrefersDark(false);
    render(<ThemeSync theme="light" />);

    os.flip(true);

    expect(themeAttr()).toBe("light"); // the user's choice wins at dusk
    expect(os.listenerCount).toBe(0); // and no listener was even registered
  });

  it("leaves the pre-paint guess alone when the profile could not be fetched", () => {
    mockPrefersDark(false);
    document.documentElement.dataset.theme = "dark"; // what the script decided

    render(<ThemeSync theme={null} />);

    expect(themeAttr()).toBe("dark"); // not overwritten with a value we lack
    expect(document.cookie).not.toContain(`${THEME_COOKIE}=`);
  });

  it("stops following the OS once unmounted", () => {
    const os = mockPrefersDark(false);
    const { unmount } = render(<ThemeSync theme="system" />);
    expect(os.listenerCount).toBe(1);

    unmount();

    expect(os.listenerCount).toBe(0);
  });
});
