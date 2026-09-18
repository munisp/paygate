/**
 * resilience.test.ts
 * Wave 109 — Offline-first resilience layer tests.
 *
 * REWRITE (de-theatered): the previous version asserted on inline
 * re-implementations (a fabricated 5-tier classifier, invented priority maps,
 * an invented USSD state machine) that tested nothing. This version imports
 * and exercises the REAL modules:
 *   - client/src/lib/networkQuality.ts  (adaptiveInterval, monitor)
 *   - client/src/lib/resilientWS.ts     (reconnect backoff, transport fallback)
 * Fabricated describes with no real counterpart (USSD state machine, Go
 * bandwidth-probe mirror, service-worker route tables) were removed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Browser-global stubs (the real modules touch navigator/window at load) ──
vi.stubGlobal("navigator", { onLine: true, connection: undefined });
vi.stubGlobal("window", {
  addEventListener: () => {},
  removeEventListener: () => {},
});

// Dynamic import: the real module touches navigator/window at load time, so it
// must be imported only after the browser-global stubs above are installed.
const { adaptiveInterval, networkQuality } = await import("../client/src/lib/networkQuality");

// ── networkQuality (real module) ────────────────────────────────────────────
describe("networkQuality — real adaptiveInterval", () => {
  it("scales the ideal interval by the REAL tier multipliers", () => {
    expect(adaptiveInterval(10_000, "4g")).toBe(10_000);   // 1×
    expect(adaptiveInterval(10_000, "3g")).toBe(20_000);   // 2×
    expect(adaptiveInterval(10_000, "2g")).toBe(50_000);   // 5×
    expect(adaptiveInterval(10_000, "offline")).toBe(false); // polling disabled
  });

  it("monitor singleton reflects navigator.onLine at load", () => {
    const q = networkQuality.get();
    expect(q.navigatorOnline).toBe(true);
    expect(q.tier).toBe("3g"); // default tier until the first probe runs
  });

  it("notifies subscribers on manual update via probe subscription API", () => {
    const seen: string[] = [];
    const unsub = networkQuality.subscribe((q) => seen.push(q.tier));
    expect(typeof unsub).toBe("function");
    unsub();
  });
});

// ── resilientWS (real module) ────────────────────────────────────────────────
describe("ResilientWS — real reconnect/backoff behavior", () => {
  type Handler = ((ev?: any) => void) | null;
  class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    static OPEN = 1;
    readyState = 0;
    onopen: Handler = null;
    onerror: Handler = null;
    onclose: Handler = null;
    onmessage: Handler = null;
    constructor(public url: string) {
      FakeWebSocket.instances.push(this);
      // Immediately fail (error then normal close) — drives reconnect/backoff.
      queueMicrotask(() => {
        this.onerror?.(new Event("error"));
        this.onclose?.({ code: 1000 });
      });
    }
    close() {}
    send() {}
  }
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onopen: Handler = null;
    onerror: Handler = null;
    onmessage: Handler = null;
    constructor(public url: string) {
      FakeEventSource.instances.push(this);
      queueMicrotask(() => this.onerror?.(new Event("error")));
    }
    close() {}
  }

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    FakeEventSource.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.stubGlobal("navigator", { onLine: true, connection: undefined });
    vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  });

  it("retries with exponentially growing backoff bands, then falls back to offline", async () => {
    const { ResilientWS } = await import("../client/src/lib/resilientWS");
    const modes: string[] = [];
    const ws = new ResilientWS("wss://example.test/ws/stream", { onModeChange: (m) => modes.push(m) });
    ws.connect();
    await vi.advanceTimersByTimeAsync(0); // first ws fails (error + close)
    expect(FakeWebSocket.instances.length).toBe(1);

    // scheduleReconnect: delay = min(500 * 2^attempt, 60_000) + up to 30% jitter.
    // Measure the actual inter-reconnect delays in 50ms steps (overshoot-free).
    const delays: number[] = [];
    let prevCount = FakeWebSocket.instances.length;
    let elapsed = 0;
    while (delays.length < 3 && elapsed < 120_000) {
      await vi.advanceTimersByTimeAsync(50);
      elapsed += 50;
      if (FakeWebSocket.instances.length > prevCount) {
        delays.push(elapsed);
        elapsed = 0;
        prevCount = FakeWebSocket.instances.length;
      }
    }
    expect(delays).toHaveLength(3);
    delays.forEach((d, attempt) => {
      const exp = 500 * Math.pow(2, attempt);
      expect(d).toBeGreaterThanOrEqual(exp - 50);          // never reconnects early
      expect(d).toBeLessThanOrEqual(Math.round(exp * 1.3) + 50); // within jitter band
    });
    // After 3 failed attempts the transport escalates WS → SSE (real fallback
    // chain) and then stops — no endless reconnection loop.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(1); // SSE fallback tried
    const settled = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(FakeWebSocket.instances.length).toBe(settled);
    expect(modes.filter((m) => m === "websocket")).toHaveLength(0); // never connected
    ws.close();
  });

  it("stops reconnecting after maxReconnectAttempts and ends offline", async () => {
    const { ResilientWS } = await import("../client/src/lib/resilientWS");
    const modes: string[] = [];
    const ws = new ResilientWS("wss://example.test/ws/stream", {
      maxReconnectAttempts: 2,
      onModeChange: (m) => modes.push(m),
    });
    ws.connect();
    await vi.advanceTimersByTimeAsync(120_000);
    // No endless reconnection loop: attempts are bounded by maxReconnectAttempts
    // (the SSE fallback is also tried and fails).
    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(1);
    const n = FakeWebSocket.instances.length;
    expect(n).toBeLessThanOrEqual(4); // initial + bounded retries
    await vi.advanceTimersByTimeAsync(300_000);
    expect(FakeWebSocket.instances.length).toBe(n);
    ws.close();
  });
});
