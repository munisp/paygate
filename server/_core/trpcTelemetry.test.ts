/**
 * trpcTelemetry.test.ts
 * Vitest unit tests for the tRPC telemetry middleware in server/_core/trpc.ts.
 *
 * Verifies that every procedure (public/protected) gets:
 *   - a span `trpc.<path>` with SERVER kind
 *   - paygate.tenant_id / paygate.merchant_id attributes from ctx
 *   - recordTrpcCall(path, status, durationMs) on completion
 *   - span ERROR status on TRPCError, with the original error re-thrown unchanged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { fakeSpan, startSpan } = vi.hoisted(() => ({
  fakeSpan: {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  },
  startSpan: vi.fn(),
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => ({ startSpan })),
    setSpan: vi.fn(() => ({})),
  },
  context: {
    active: vi.fn(() => ({})),
    with: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  },
  SpanKind: { SERVER: 1 },
  SpanStatusCode: { ERROR: 2 },
}));

vi.mock('../metrics', () => ({
  recordTrpcCall: vi.fn(),
}));

// Real ../tracing (setTenantAttrs) is used — it no-ops cleanly without
// OTEL_EXPORTER_OTLP_ENDPOINT, which is exactly the production-disabled path.

import { trace } from '@opentelemetry/api';
import { recordTrpcCall } from '../metrics';
import { router, publicProcedure, protectedProcedure } from './trpc';
import type { TrpcContext } from './context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    req: {} as TrpcContext['req'],
    res: {} as TrpcContext['res'],
    user: null,
    ...overrides,
  };
}

const fakeUser = {
  id: 'user-1',
  tenantId: 'tenant-42',
  role: 'user',
} as unknown as NonNullable<TrpcContext['user']>;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('tRPC telemetry middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startSpan.mockReturnValue(fakeSpan);
  });

  it('creates a span named trpc.<path> with SERVER kind', async () => {
    const r = router({ ping: publicProcedure.query(() => 'pong') });
    await r.createCaller(makeCtx()).ping();

    expect(startSpan).toHaveBeenCalledWith('trpc.ping', { kind: 1 });
    expect(fakeSpan.end).toHaveBeenCalledTimes(1);
  });

  it('sets tenant attributes from ctx when present', async () => {
    const r = router({ ping: publicProcedure.query(() => 'pong') });
    const ctx = makeCtx({ user: fakeUser });
    (ctx as unknown as Record<string, unknown>).merchantId = 'merchant-7';
    await r.createCaller(ctx).ping();

    expect(fakeSpan.setAttribute).toHaveBeenCalledWith('paygate.tenant_id', 'tenant-42');
    expect(fakeSpan.setAttribute).toHaveBeenCalledWith('paygate.merchant_id', 'merchant-7');
    expect(fakeSpan.setAttribute).toHaveBeenCalledWith('paygate.user_id', 'user-1');
  });

  it('records a success metric with duration', async () => {
    const r = router({ ping: publicProcedure.query(() => 'pong') });
    const out = await r.createCaller(makeCtx()).ping();

    expect(out).toBe('pong');
    expect(recordTrpcCall).toHaveBeenCalledTimes(1);
    const [path, status, durationMs] = vi.mocked(recordTrpcCall).mock.calls[0];
    expect(path).toBe('ping');
    expect(status).toBe('success');
    expect(typeof durationMs).toBe('number');
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('passes TRPCError through unchanged, marks span and records error metric', async () => {
    const boom = new TRPCError({ code: 'FORBIDDEN', message: 'nope' });
    const r = router({
      fail: publicProcedure.query(() => {
        throw boom;
      }),
    });

    const err = await r
      .createCaller(makeCtx())
      .fail()
      .catch((e: unknown) => e);

    // Original error identity is preserved (never swallowed/altered).
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('FORBIDDEN');
    expect((err as TRPCError).message).toBe('nope');
    expect(fakeSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'FORBIDDEN' });
    expect(recordTrpcCall).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordTrpcCall).mock.calls[0][1]).toBe('error');
    expect(fakeSpan.end).toHaveBeenCalledTimes(1);
  });

  it('applies to protectedProcedure and lets auth errors pass through', async () => {
    const r = router({ secret: protectedProcedure.query(() => 's') });

    const err = await r
      .createCaller(makeCtx()) // no user
      .secret()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('UNAUTHORIZED');
    expect(vi.mocked(recordTrpcCall).mock.calls[0][1]).toBe('error');
    expect(fakeSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'UNAUTHORIZED' });
  });

  it('telemetry failure cannot break a request', async () => {
    vi.mocked(trace.getTracer).mockImplementationOnce(() => {
      throw new Error('otel exploded');
    });
    const r = router({ ping: publicProcedure.query(() => 'pong') });
    const out = await r.createCaller(makeCtx()).ping();
    expect(out).toBe('pong');
  });
});
