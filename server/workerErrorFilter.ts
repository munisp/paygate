/**
 * Filter for background worker errors.
 * Suppresses expected errors when the database is unreachable, tables
 * are not yet migrated, or external services are unavailable in
 * sandbox/development environments.
 */
export function isSuppressedWorkerError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);

  // Table not yet migrated
  if (msg.includes('relation') && msg.includes('does not exist')) return true;

  // DB not running locally (PostgreSQL ECONNREFUSED)
  if (msg.includes('connect ECONNREFUSED')) return true;

  // Drizzle query failure (wraps the above)
  if (msg.includes('Failed query')) return true;

  // Network fetch failures for external services (NIP API, USDC, etc.)
  if (msg.includes('fetch failed')) return true;
  if (msg.includes('ECONNREFUSED')) return true;
  if (msg.includes('ENOTFOUND')) return true;
  if (msg.includes('ETIMEDOUT')) return true;
  if (msg.includes('network timeout')) return true;
  if (msg.includes('AbortError')) return true;

  // NIP bank list fetch failures
  if (msg.includes('NIP bank list fetch failed')) return true;

  return false;
}
