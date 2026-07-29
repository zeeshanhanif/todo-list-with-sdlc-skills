import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import { Logger } from '@nestjs/common';
import { SupabaseRealtimePublisher } from './supabase-realtime.publisher';
import { NoopRealtimePublisher } from './noop-realtime.publisher';

// FEAT-019 T3 / AC-4, AC-7, AC-11 — the publisher against a real local HTTP
// server, because the properties that matter are transport properties: what
// exactly goes on the wire, and what a sick dependency costs the write that
// triggered it.

const USER = '33333333-3333-4333-8333-333333333333';
const SERVICE_KEY = 'test-service-role-key';

interface CapturedRequest {
  url: string;
  method: string;
  headers: IncomingMessage['headers'];
  body: string;
}

describe('SupabaseRealtimePublisher', () => {
  let server: Server;
  let baseUrl: string;
  let captured: CapturedRequest[];
  /** How the stub answers the next requests: 200, 500, or never. */
  let mode: 'ok' | 'error' | 'hang';
  const env = { ...process.env };
  let errors: string[];
  let warns: string[];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        captured.push({
          url: req.url ?? '',
          method: req.method ?? '',
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        if (mode === 'hang') return; // never responds — the caller must time out
        res.writeHead(mode === 'ok' ? 202 : 500, {
          'content-type': 'application/json',
        });
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    captured = [];
    mode = 'ok';
    errors = [];
    warns = [];
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((m: unknown) => errors.push(String(m)));
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((m: unknown) => warns.push(String(m)));
    process.env.REALTIME_PROVIDER = 'supabase';
    process.env.SUPABASE_URL = baseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    process.env.REALTIME_PUBLISH_TIMEOUT_MS = '150';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
  });

  it('puts a cursor on the wire and nothing else (AC-7)', async () => {
    await new SupabaseRealtimePublisher().publishChanged(USER);

    expect(captured).toHaveLength(1);
    const sent = JSON.parse(captured[0].body) as {
      messages: { topic: string; event: string; payload: { cursor: string } }[];
    };

    // The body is asserted whole — this is the criterion that keeps task
    // content off a channel we do not authorize ourselves.
    expect(Object.keys(sent)).toEqual(['messages']);
    expect(sent.messages).toHaveLength(1);
    expect(Object.keys(sent.messages[0]).sort()).toEqual([
      'event',
      'payload',
      'topic',
    ]);
    expect(sent.messages[0].topic).toBe(`user:${USER}`);
    expect(sent.messages[0].event).toBe('changed');
    expect(Object.keys(sent.messages[0].payload)).toEqual(['cursor']);
    expect(new Date(sent.messages[0].payload.cursor).toISOString()).toBe(
      sent.messages[0].payload.cursor,
    );
  });

  it('marks the broadcast private and authenticates with the service key', async () => {
    await new SupabaseRealtimePublisher().publishChanged(USER);

    expect(captured[0].method).toBe('POST');
    expect(captured[0].url).toBe('/realtime/v1/api/broadcast?private=true');
    expect(captured[0].headers.apikey).toBe(SERVICE_KEY);
    expect(captured[0].headers.authorization).toBe(`Bearer ${SERVICE_KEY}`);
  });

  it('swallows a 500 and logs one structured line (AC-4, AC-11)', async () => {
    mode = 'error';
    await expect(
      new SupabaseRealtimePublisher().publishChanged(USER),
    ).resolves.toBeUndefined();

    expect(errors).toHaveLength(1);
    const line = JSON.parse(errors[0]) as { msg: string; reason: string };
    expect(line.msg).toBe('realtime publish failed');
    expect(line.reason).toBe('http_500');
    // The key is never in a log line (AC-8).
    expect(errors[0]).not.toContain(SERVICE_KEY);
  });

  it('swallows a refused connection (AC-4)', async () => {
    // Port 1 on loopback: nothing listens, so connect() fails immediately.
    process.env.SUPABASE_URL = 'http://127.0.0.1:1';
    await expect(
      new SupabaseRealtimePublisher().publishChanged(USER),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('gives up at the configured cap when the endpoint hangs (AC-4)', async () => {
    mode = 'hang';
    const started = Date.now();
    await expect(
      new SupabaseRealtimePublisher().publishChanged(USER),
    ).resolves.toBeUndefined();
    const elapsed = Date.now() - started;

    // The cap is 150ms here; the generous ceiling keeps the assertion about
    // "bounded" rather than about the machine's timer precision.
    expect(elapsed).toBeLessThan(1_000);
    expect(errors).toHaveLength(1);
    expect((JSON.parse(errors[0]) as { reason: string }).reason).toMatch(
      /TimeoutError|AbortError/,
    );
  });

  it('logs nothing when the publish succeeds (AC-11)', async () => {
    await new SupabaseRealtimePublisher().publishChanged(USER);
    expect(errors).toEqual([]);
    expect(warns).toEqual([]);
  });

  describe('circuit breaker (AC-4)', () => {
    it('opens after three consecutive failures and stops paying the cap', async () => {
      mode = 'error';
      const publisher = new SupabaseRealtimePublisher();

      for (let i = 0; i < 3; i++) await publisher.publishChanged(USER);
      expect(captured).toHaveLength(3);
      expect(warns.map((w) => (JSON.parse(w) as { msg: string }).msg)).toEqual([
        'realtime breaker open',
      ]);

      // Open: the next writes make no request at all — a broken Realtime costs
      // them nothing, not even the timeout.
      await publisher.publishChanged(USER);
      await publisher.publishChanged(USER);
      expect(captured).toHaveLength(3);
    });

    it('lets exactly one probe through after the open window, then closes on success', async () => {
      mode = 'error';
      const publisher = new SupabaseRealtimePublisher();
      for (let i = 0; i < 3; i++) await publisher.publishChanged(USER);
      expect(captured).toHaveLength(3);

      // 31 seconds later. Date.now is the breaker's only clock; the fetch
      // timeout runs on real timers and is unaffected.
      const realNow = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(realNow + 31_000);

      mode = 'ok';
      await publisher.publishChanged(USER);
      expect(captured).toHaveLength(4);
      expect(warns.map((w) => (JSON.parse(w) as { msg: string }).msg)).toEqual([
        'realtime breaker open',
        'realtime breaker closed',
      ]);

      // Closed again: traffic flows without waiting for another window.
      await publisher.publishChanged(USER);
      expect(captured).toHaveLength(5);
    });
  });
});

describe('NoopRealtimePublisher', () => {
  it('performs no I/O and no logging', async () => {
    const errors: string[] = [];
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((m: unknown) => errors.push(String(m)));
    const fetchSpy = jest.spyOn(globalThis, 'fetch');

    await expect(
      new NoopRealtimePublisher().publishChanged(),
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
    jest.restoreAllMocks();
  });
});
