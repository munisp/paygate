/**
 * useTrpc — lightweight imperative tRPC wrapper for screens that need
 * manual fetch control (pull-to-refresh, one-shot mutations, etc.)
 */
import { trpc, API_BASE_URL } from '../lib/trpc';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useTrpc() {
  const utils = trpc.useUtils();

  /**
   * Execute a tRPC query by dot-path string, e.g. 'posTerminals.list'
   * Returns the raw result data.
   */
  async function query(path: string, input: Record<string, unknown> = {}) {
    const token = await AsyncStorage.getItem('session_token');
    const res = await fetch(`${API_BASE_URL}/api/trpc/${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    const token = await AsyncStorage.getItem('session_token');
    const res = await fetch(`${API_BASE_URL}/api/trpc/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
