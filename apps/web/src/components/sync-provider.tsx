"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { REALTIME_TOKEN_PATH, type RealtimeTokenResponse } from "@todo/shared";
import {
  COALESCE_MS,
  nextPollDelay,
  tokenRefreshDelay,
} from "@/lib/sync-schedule";
import type { RealtimeSubscription } from "@/lib/realtime-client";

// Cross-device sync, mounted once in the app shell (FEAT-019; ADR-006).
//
// **It renders nothing.** ui-design D1 ruled the refresh silent: no indicator,
// no "live" dot, no announcement, no arrival animation. The client cannot know
// whether a refresh changed anything (router.refresh() re-renders the route
// wholesale and there is no client store to diff), so any announcement would
// fire blind — as often as every 4 s in the fallback configuration — and say
// "updated" when nothing had. Sync is felt, never seen.
//
// It also must never disturb what the user is doing (ui-design D2).
// `router.refresh()` earns that for free: it re-renders server components while
// preserving client state, focus, scroll and open overlays — the property
// task-checkbox.tsx has relied on since FEAT-012. This component's own job is
// only to decide WHEN to call it.

/** Injectable for tests — the real one dynamically imports supabase-js. */
export type SubscribeFn = (
  options: import("@/lib/realtime-client").SubscribeOptions,
) => Promise<RealtimeSubscription>;

export function SyncProvider({
  /** Test seam only; production passes nothing and the real client loads. */
  subscribe,
}: {
  subscribe?: SubscribeFn;
} = {}) {
  const router = useRouter();
  // Everything below is a ref, not state: this component never re-renders
  // itself, and a setState here would be a render the shell does not need.
  // 0 until the effect starts it: React's purity rule forbids calling Date.now
  // during render, and the effect is where this component's life begins anyway.
  const lastActivity = useRef(0);
  const connected = useRef(false);
  const coalesceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  useEffect(() => {
    disposed.current = false;
    lastActivity.current = Date.now();
    let subscription: RealtimeSubscription | null = null;
    let tokenTimer: ReturnType<typeof setTimeout> | null = null;

    /** One refresh per burst (D6). Signals are coalesced, never dropped: a
     * duplicate refresh costs a refetch, a dropped one leaves a stale screen. */
    const scheduleRefresh = () => {
      if (disposed.current || coalesceTimer.current) return;
      coalesceTimer.current = setTimeout(() => {
        coalesceTimer.current = null;
        router.refresh();
      }, COALESCE_MS);
    };

    /** The user asked for freshness implicitly (focus, visibility, reconnect):
     * refetch now rather than at the next tick. */
    const refreshNow = () => {
      if (disposed.current) return;
      if (coalesceTimer.current) {
        clearTimeout(coalesceTimer.current);
        coalesceTimer.current = null;
      }
      router.refresh();
    };

    const scheduleNextPoll = () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = null;
      if (disposed.current) return;

      const delay = nextPollDelay({
        connected: connected.current,
        visible: document.visibilityState === "visible",
        msSinceActivity: Date.now() - lastActivity.current,
      });
      if (delay === null) return; // connected, or hidden — nothing to schedule

      pollTimer.current = setTimeout(() => {
        pollTimer.current = null;
        scheduleRefresh();
        scheduleNextPoll();
      }, delay);
    };

    const onActivity = () => {
      lastActivity.current = Date.now();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        onActivity();
        // Whatever happened while this tab was hidden is applied before the
        // user reads a stale screen (AC-2).
        refreshNow();
      }
      scheduleNextPoll();
    };

    const onFocusOrOnline = () => {
      onActivity();
      refreshNow();
      scheduleNextPoll();
    };

    window.addEventListener("focus", onFocusOrOnline);
    window.addEventListener("online", onFocusOrOnline);
    document.addEventListener("visibilitychange", onVisibility);
    for (const event of ["pointerdown", "keydown"] as const) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    scheduleNextPoll();

    // The socket, when there is one to open. `{ enabled: false }` — today's
    // default, since no Supabase project is provisioned — is a normal answer:
    // the fallback schedule above already covers NFR-PERF-004 (D4).
    const connect = async () => {
      try {
        const res = await fetch(REALTIME_TOKEN_PATH_PROXY, {
          cache: "no-store",
        });
        if (!res.ok || disposed.current) return; // 401 = signed out; the shell handles that
        const body = (await res.json()) as RealtimeTokenResponse;
        if (!body.enabled || disposed.current) return;

        const open = subscribe ?? (await loadSubscribe());
        subscription = await open({
          connection: body,
          onSignal: scheduleRefresh,
          onConnectionChange: (isConnected) => {
            connected.current = isConnected;
            // Losing the socket hands the fallback schedule back its job
            // immediately, rather than at some later tick.
            scheduleNextPoll();
          },
        });
        if (disposed.current) {
          subscription.close();
          subscription = null;
          return;
        }

        // Re-mint before the current token expires, so the socket is
        // re-authenticated rather than dropped (D5).
        tokenTimer = setTimeout(() => {
          void refreshToken();
        }, tokenRefreshDelay(body.expiresAt));
      } catch {
        // No socket: the fallback schedule is already running. A sync failure
        // is silent by design (ui-design D1) — it degrades latency, not
        // function, and shows the user nothing.
      }
    };

    const refreshToken = async () => {
      if (disposed.current || !subscription) return;
      try {
        const res = await fetch(REALTIME_TOKEN_PATH_PROXY, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as RealtimeTokenResponse;
        if (!body.enabled || disposed.current || !subscription) return;
        subscription.setToken(body.token);
        tokenTimer = setTimeout(() => {
          void refreshToken();
        }, tokenRefreshDelay(body.expiresAt));
      } catch {
        // Keep the current token; the socket drops when it expires and the
        // fallback takes over.
      }
    };

    void connect();

    // The E2E seam (technical-design §5): with NEXT_PUBLIC_SYNC_TEST_HOOK set,
    // Playwright can drive the signal path deterministically without a socket.
    // Absent in production builds, where the condition is statically false.
    if (process.env.NEXT_PUBLIC_SYNC_TEST_HOOK) {
      (window as unknown as { __todoSync?: { signal(): void } }).__todoSync = {
        signal: scheduleRefresh,
      };
    }

    return () => {
      disposed.current = true;
      window.removeEventListener("focus", onFocusOrOnline);
      window.removeEventListener("online", onFocusOrOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const event of ["pointerdown", "keydown"] as const) {
        window.removeEventListener(event, onActivity);
      }
      if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (tokenTimer) clearTimeout(tokenTimer);
      coalesceTimer.current = null;
      pollTimer.current = null;
      subscription?.close();
      delete (window as unknown as { __todoSync?: unknown }).__todoSync;
    };
  }, [router, subscribe]);

  return null;
}

/** The BFF route, not the API path — the browser never calls the API directly. */
const REALTIME_TOKEN_PATH_PROXY = `/api${REALTIME_TOKEN_PATH}`;

/** Separate so the dynamic import is one line and the unit suite can avoid it
 * entirely by passing `subscribe`. */
async function loadSubscribe(): Promise<SubscribeFn> {
  const { subscribeToChanges } = await import("@/lib/realtime-client");
  return subscribeToChanges;
}
