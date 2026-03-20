/**
 * Circuit Breaker
 *
 * Prevents cascading failures when external microservices are unavailable.
 * Implements the standard three-state circuit breaker pattern:
 *
 *   CLOSED → normal operation, all calls pass through
 *   OPEN   → service is down, calls are rejected immediately (no waiting)
 *   HALF_OPEN → probe state, one call is allowed through to test recovery
 *
 * Usage:
 *   const cb = getCircuitBreaker("go-bridge");
 *   const result = await cb.execute(() => callGoService(payload));
 */
import { logger } from "./logger";

type State = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Milliseconds to wait before moving from OPEN → HALF_OPEN. Default: 30_000 */
  recoveryTimeMs?: number;
  /** Milliseconds before a successful call resets the failure count. Default: 60_000 */
  successResetMs?: number;
}

class CircuitBreaker {
  private state: State = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = Date.now();

  constructor(
    private readonly name: string,
    private readonly opts: Required<CircuitBreakerOptions>
  ) {}

  get currentState(): State {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.opts.recoveryTimeMs) {
        this.state = "HALF_OPEN";
        logger.info("circuit_breaker_half_open", { name: this.name, elapsed });
      } else {
        throw new CircuitBreakerOpenError(this.name, this.opts.recoveryTimeMs - elapsed);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.lastSuccessTime = Date.now();
    if (this.state !== "CLOSED") {
      logger.info("circuit_breaker_closed", { name: this.name });
      this.state = "CLOSED";
    }
  }

  private onFailure(err: unknown) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === "HALF_OPEN" || this.failureCount >= this.opts.failureThreshold) {
      logger.warn("circuit_breaker_opened", {
        name: this.name,
        failureCount: this.failureCount,
        error: (err as any)?.message,
      });
      this.state = "OPEN";
    }
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker '${name}' is OPEN — retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "CircuitBreakerOpenError";
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  opts: CircuitBreakerOptions = {}
): CircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker(name, {
      failureThreshold: opts.failureThreshold ?? 5,
      recoveryTimeMs: opts.recoveryTimeMs ?? 30_000,
      successResetMs: opts.successResetMs ?? 60_000,
    }));
  }
  return registry.get(name)!;
}

/**
 * Get health stats for all registered circuit breakers.
 * Used by the /api/health endpoint.
 */
export function getAllCircuitBreakerStats() {
  return Array.from(registry.values()).map(cb => cb.getStats());
}

/**
 * Wrap a function call with a circuit breaker and a fallback.
 * If the circuit is open or the call fails, the fallback is returned.
 *
 * @example
 * const result = await withFallback(
 *   "go-bridge",
 *   () => callGoService(payload),
 *   () => ({ status: "degraded", message: "Go bridge unavailable" })
 * );
 */
export async function withFallback<T>(
  breakerName: string,
  fn: () => Promise<T>,
  fallback: () => T | Promise<T>,
  opts?: CircuitBreakerOptions
): Promise<T> {
  const cb = getCircuitBreaker(breakerName, opts);
  try {
    return await cb.execute(fn);
  } catch (err) {
    if (err instanceof CircuitBreakerOpenError) {
      logger.warn("circuit_breaker_fallback", { name: breakerName, reason: "circuit_open" });
    } else {
      logger.warn("circuit_breaker_fallback", { name: breakerName, error: (err as any)?.message });
    }
    return fallback();
  }
}
