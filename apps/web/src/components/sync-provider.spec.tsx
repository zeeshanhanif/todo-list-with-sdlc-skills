import { act, render } from "@testing-library/react";
import { SyncProvider, type SubscribeFn } from "@/components/sync-provider";
import {
  ACTIVE_POLL_MS,
  COALESCE_MS,
  IDLE_AFTER_MS,
  IDLE_POLL_MS,
} from "@/lib/sync-schedule";

// FEAT-019 T6 / AC-1, AC-2, AC-9, AC-10 — the island's behaviour, driven with
// fake timers. It renders nothing, so every assertion is about WHEN it calls
// router.refresh() and what it opens.

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: (...args: unknown[]) => refresh(...args) }),
}));

/** The API's answer for an environment with no Realtime provider — today's
 * default everywhere, and the configuration AC-2 is about. */
const disabled = () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ enabled: false }),
  } as Response);

const enabled = (expiresInMs = 30 * 60_000) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        enabled: true,
        url: "https://project.supabase.co",
        publishableKey: "anon-key",
        token: "minted-token",
        channel: "user:u1",
        expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
      }),
  } as Response);

/** Let the provider's token fetch settle without advancing fake timers. */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
};

describe("SyncProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    refresh.mockClear();
    setVisibility("visible");
    global.fetch = jest.fn(disabled) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders nothing at all (ui-design D1)", async () => {
    const { container } = render(<SyncProvider />);
    await settle();
    expect(container).toBeEmptyDOMElement();
  });

  describe("fallback schedule (AC-2)", () => {
    it("refetches on the active interval when no provider is configured", async () => {
      render(<SyncProvider />);
      await settle();
      expect(refresh).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(ACTIVE_POLL_MS + COALESCE_MS);
      });
      expect(refresh).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(ACTIVE_POLL_MS + COALESCE_MS);
      });
      expect(refresh).toHaveBeenCalledTimes(2);
      // Convergence inside NFR-PERF-004's 5 s, without a socket.
      expect(ACTIVE_POLL_MS + COALESCE_MS).toBeLessThan(5_000);
    });

    it("backs off after two idle minutes", async () => {
      render(<SyncProvider />);
      await settle();

      // Sit idle past the threshold, consuming the active-interval ticks. The
      // extra coalesce window flushes the LAST active tick's pending refresh,
      // so what follows measures the new cadence and not that leftover.
      act(() => {
        jest.advanceTimersByTime(IDLE_AFTER_MS + COALESCE_MS);
      });
      refresh.mockClear();

      // Now the interval is the idle one: nothing at the old cadence...
      act(() => {
        jest.advanceTimersByTime(ACTIVE_POLL_MS * 2);
      });
      expect(refresh).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(IDLE_POLL_MS + COALESCE_MS);
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("returns to the active interval when the user comes back", async () => {
      render(<SyncProvider />);
      await settle();
      act(() => {
        jest.advanceTimersByTime(IDLE_AFTER_MS);
      });
      refresh.mockClear();

      act(() => {
        window.dispatchEvent(new Event("pointerdown"));
        jest.advanceTimersByTime(IDLE_POLL_MS + COALESCE_MS);
      });
      refresh.mockClear();

      act(() => {
        jest.advanceTimersByTime(ACTIVE_POLL_MS + COALESCE_MS);
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("does not poll while the tab is hidden", async () => {
      render(<SyncProvider />);
      await settle();

      act(() => {
        setVisibility("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      refresh.mockClear();

      act(() => {
        jest.advanceTimersByTime(10 * IDLE_POLL_MS);
      });
      expect(refresh).not.toHaveBeenCalled();
    });

    it("refetches immediately on visibility, focus and online", async () => {
      render(<SyncProvider />);
      await settle();

      act(() => {
        setVisibility("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        setVisibility("visible");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(refresh).toHaveBeenCalledTimes(1); // no timer wait

      act(() => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(refresh).toHaveBeenCalledTimes(2);

      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      expect(refresh).toHaveBeenCalledTimes(3);
    });
  });

  describe("signal path (AC-1, AC-9)", () => {
    /** A fake transport: the provider never loads supabase-js in these tests. */
    const fakeTransport = () => {
      let onSignal = () => {};
      let onConnectionChange: (connected: boolean) => void = () => {};
      const closed = { value: false };
      const subscribe: SubscribeFn = (options) => {
        onSignal = options.onSignal;
        onConnectionChange = options.onConnectionChange;
        return Promise.resolve({
          close: () => {
            closed.value = true;
          },
          setToken: () => {},
        });
      };
      return {
        subscribe,
        closed,
        signal: () => onSignal(),
        connect: () => onConnectionChange(true),
        drop: () => onConnectionChange(false),
      };
    };

    it("refreshes on a signal, and coalesces a burst into one refresh", async () => {
      const transport = fakeTransport();
      global.fetch = jest.fn(() => enabled()) as unknown as typeof fetch;
      render(<SyncProvider subscribe={transport.subscribe} />);
      await settle();

      act(() => {
        transport.connect();
        transport.signal();
        transport.signal();
        transport.signal();
        jest.advanceTimersByTime(COALESCE_MS);
      });
      expect(refresh).toHaveBeenCalledTimes(1);

      act(() => {
        transport.signal();
        jest.advanceTimersByTime(COALESCE_MS);
      });
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("stops polling while connected and resumes when the socket drops", async () => {
      const transport = fakeTransport();
      global.fetch = jest.fn(() => enabled()) as unknown as typeof fetch;
      render(<SyncProvider subscribe={transport.subscribe} />);
      await settle();

      act(() => {
        transport.connect();
      });
      refresh.mockClear();

      act(() => {
        jest.advanceTimersByTime(10 * ACTIVE_POLL_MS);
      });
      expect(refresh).not.toHaveBeenCalled(); // signals cover it

      act(() => {
        transport.drop();
        jest.advanceTimersByTime(ACTIVE_POLL_MS + COALESCE_MS);
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("closes the subscription on unmount (AC-10)", async () => {
      const transport = fakeTransport();
      global.fetch = jest.fn(() => enabled()) as unknown as typeof fetch;
      const { unmount } = render(
        <SyncProvider subscribe={transport.subscribe} />,
      );
      await settle();

      unmount();
      expect(transport.closed.value).toBe(true);

      // And nothing keeps firing after the shell is gone (sign-out).
      refresh.mockClear();
      act(() => {
        jest.advanceTimersByTime(10 * IDLE_POLL_MS);
      });
      expect(refresh).not.toHaveBeenCalled();
    });

    it("never opens a socket when the provider is disabled (AC-10)", async () => {
      const transport = fakeTransport();
      const opened = jest.fn(transport.subscribe);
      global.fetch = jest.fn(disabled) as unknown as typeof fetch;

      render(<SyncProvider subscribe={opened as SubscribeFn} />);
      await settle();

      expect(opened).not.toHaveBeenCalled();
    });

    it("falls back silently when the token request fails", async () => {
      global.fetch = jest.fn(() =>
        Promise.reject(new Error("offline")),
      ) as unknown as typeof fetch;

      render(<SyncProvider />);
      await settle();

      // No throw, no UI, and the schedule still runs.
      act(() => {
        jest.advanceTimersByTime(ACTIVE_POLL_MS + COALESCE_MS);
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });
});
