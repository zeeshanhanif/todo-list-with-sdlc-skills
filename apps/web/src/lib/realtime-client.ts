import type { RealtimeTokenResponse } from "@todo/shared";

// The entire client-side Supabase coupling (FEAT-019 D10, ADR-006's "accepted,
// isolated coupling"). Everything else in the web tier — the provider, the
// schedule, the refresh — is provider-agnostic, so swapping Realtime for
// another pub/sub, or for the polling substitute alone, replaces this file.
//
// supabase-js is loaded with a DYNAMIC import, and only when the API says a
// provider is configured. Today that is never (no project provisioned), so the
// default configuration ships zero bytes of it to the browser and the unit
// suite never touches it.

/** What the provider needs from a subscription, with no Supabase types in it. */
export interface RealtimeSubscription {
  close(): void;
  /** Re-authenticate the live socket with a freshly minted token. */
  setToken(token: string): void;
}

export interface SubscribeOptions {
  connection: Extract<RealtimeTokenResponse, { enabled: true }>;
  /** A `changed` signal arrived — the provider decides what to do with it. */
  onSignal(): void;
  /** Transport state. `false` puts the fallback schedule back in charge. */
  onConnectionChange(connected: boolean): void;
}

/**
 * Opens the caller's private per-user channel and calls `onSignal` on every
 * `changed` broadcast.
 *
 * The channel is private (`config.private`), so Supabase authorizes the
 * subscription against the RLS policy on `realtime.messages` using the minted
 * token's `sub` — the policy in `deploy/supabase/realtime-authorization.sql`.
 * Without that policy applied, a subscription is refused rather than silently
 * over-broad, which is the failure direction we want.
 */
export async function subscribeToChanges({
  connection,
  onSignal,
  onConnectionChange,
}: SubscribeOptions): Promise<RealtimeSubscription> {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(connection.url, connection.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The socket authenticates with OUR token, not a Supabase Auth session —
  // this is the line ADR-006 turns on (we use Realtime without Supabase Auth).
  await client.realtime.setAuth(connection.token);

  const channel = client.channel(connection.channel, {
    config: { private: true },
  });

  channel
    .on("broadcast", { event: "changed" }, () => onSignal())
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onConnectionChange(true);
        // A drop can lose signals, so the reconnect itself is a reason to
        // refetch — arch §8's "the client still refetches on reconnect".
        onSignal();
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        onConnectionChange(false);
      }
    });

  return {
    close: () => {
      void client.removeChannel(channel);
    },
    setToken: (token: string) => {
      void client.realtime.setAuth(token);
    },
  };
}
