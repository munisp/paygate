/**
 * useTrpc — lightweight imperative tRPC wrapper for screens that need
 * manual fetch control (pull-to-refresh, one-shot mutations, etc.)
 */
import { trpc, API_BASE_URL, getAuthToken } from '../lib/trpc';

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * fetch with a 30s AbortController timeout so hung requests fail instead of
 * blocking forever.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Current auth token from the module cache (synced with expo-secure-store). */
function requireToken(): string {
  const token = getAuthToken();
  if (!token) {
    throw new Error('[useTrpc] Missing auth token — user is not authenticated');
  }
  return token;
}

export function useTrpc() {
  const utils = trpc.useUtils();

  /**
   * Execute a tRPC query by dot-path string, e.g. 'posTerminals.list'
   * Returns the raw result data.
   */
  async function query(path: string, input: Record<string, unknown> = {}) {
    const token = requireToken();
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/trpc/${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err?.error?.message ?? err?.message ?? 'Request failed');
    }
    const json = await res.json();
    return json?.result?.data ?? json;
  }

  /**
   * Execute a tRPC mutation by dot-path string, e.g. 'pos.register'
   */
  async function mutate(path: string, input: Record<string, unknown> = {}) {
    const token = requireToken();
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/trpc/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ json: input }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err?.error?.message ?? err?.message ?? 'Request failed');
    }
    const json = await res.json();
    return json?.result?.data ?? json;
  }

  return { query, mutate, utils };
}
