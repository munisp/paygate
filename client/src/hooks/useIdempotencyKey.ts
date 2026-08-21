import { useCallback, useRef } from "react";

/**
 * Holds an idempotency key for a single logical operation.
 *
 * The server requires an `idempotencyKey` on money-moving mutations and uses
 * it to deduplicate retries. This hook generates a key lazily (on first
 * submit) and REUSES the same key across retries of the same logical
 * operation. Call `reset()` only after the operation completes (success or
 * terminal failure) so the next logical operation gets a fresh key.
 */
export function useIdempotencyKey() {
  const keyRef = useRef<string | null>(null);

  const getKey = useCallback((): string => {
    if (!keyRef.current) {
      keyRef.current = crypto.randomUUID();
    }
    return keyRef.current;
  }, []);

  const reset = useCallback(() => {
    keyRef.current = null;
  }, []);

  return { getKey, reset };
}
