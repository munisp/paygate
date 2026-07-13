/**
 * apisixClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * APISIX API Gateway client for PayGate.
 * Manages routes, upstreams, consumers, and plugins dynamically.
 */
import { ENV } from "./_core/env";
import { logger } from "./logger";

export interface ApisixRoute {
  id: string;
  uri: string;
  name?: string;
  methods?: string[];
  upstream_id?: string;
  plugins?: Record<string, any>;
  status?: number;
}

/**
 * Syncs a route configuration to APISIX
 */
export async function syncRoute(route: ApisixRoute): Promise<boolean> {
  if (!ENV.apisixAdminUrl) {
    logger.warn("[APISIX] apisixAdminUrl not configured, skipping route sync");
    return false;
  }

  try {
    const url = `${ENV.apisixAdminUrl}/routes/${route.id}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-API-KEY": ENV.apisixApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(route),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[APISIX] Failed to sync route ${route.id}: ${res.status} ${err}`);
      return false;
    }

    logger.info(`[APISIX] Successfully synced route ${route.id}`);
    return true;
  } catch (err) {
    logger.error(`[APISIX] Error syncing route ${route.id}:`, err);
    return false;
  }
}

/**
 * Deletes a route from APISIX
 */
export async function deleteRoute(routeId: string): Promise<boolean> {
  if (!ENV.apisixAdminUrl) return false;

  try {
    const url = `${ENV.apisixAdminUrl}/routes/${routeId}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-API-KEY": ENV.apisixApiKey,
      },
    });

    if (!res.ok && res.status !== 404) {
      logger.error(`[APISIX] Failed to delete route ${routeId}: ${res.status}`);
      return false;
    }

    logger.info(`[APISIX] Successfully deleted route ${routeId}`);
    return true;
  } catch (err) {
    logger.error(`[APISIX] Error deleting route ${routeId}:`, err);
    return false;
  }
}

/**
 * Creates or updates a consumer in APISIX (for API key authentication)
 */
export async function syncConsumer(username: string, plugins: Record<string, any>): Promise<boolean> {
  if (!ENV.apisixAdminUrl) return false;

  try {
    const url = `${ENV.apisixAdminUrl}/consumers`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-API-KEY": ENV.apisixApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        plugins,
      }),
    });

    if (!res.ok) {
      logger.error(`[APISIX] Failed to sync consumer ${username}: ${res.status}`);
      return false;
    }

    return true;
  } catch (err) {
    logger.error(`[APISIX] Error syncing consumer ${username}:`, err);
    return false;
  }
}

/**
 * Deletes a consumer from APISIX (called when an API key is revoked)
 */
export async function deleteConsumer(username: string): Promise<boolean> {
  if (!ENV.apisixAdminUrl) return false;
  try {
    const url = `${ENV.apisixAdminUrl}/consumers/${encodeURIComponent(username)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "X-API-KEY": ENV.apisixApiKey },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok && res.status !== 404) {
      logger.error(`[APISIX] Failed to delete consumer ${username}: ${res.status}`);
      return false;
    }
    logger.info(`[APISIX] Deleted consumer ${username}`);
    return true;
  } catch (err) {
    logger.error(`[APISIX] Error deleting consumer ${username}:`, err);
    return false;
  }
}

/**
 * Lists all consumers from APISIX (used by monitoring dashboard)
 */
export async function listConsumers(): Promise<{ total: number; consumers: Array<{ username: string; plugins: Record<string, any>; create_time?: number; update_time?: number }> }> {
  if (!ENV.apisixAdminUrl) return { total: 0, consumers: [] };
  try {
    const url = `${ENV.apisixAdminUrl}/consumers`;
    const res = await fetch(url, {
      headers: { "X-API-KEY": ENV.apisixApiKey },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { total: 0, consumers: [] };
    const data = await res.json() as any;
    const consumers = (data?.list ?? data?.node?.nodes ?? []).map((n: any) => n.value ?? n);
    return { total: consumers.length, consumers };
  } catch {
    return { total: 0, consumers: [] };
  }
}

/**
 * Lists all routes from APISIX (used by monitoring dashboard)
 */
export async function listRoutes(): Promise<{ total: number; routes: Array<{ id: string; uri: string; name?: string; status: number; plugins?: Record<string, any> }> }> {
  if (!ENV.apisixAdminUrl) return { total: 0, routes: [] };
  try {
    const url = `${ENV.apisixAdminUrl}/routes`;
    const res = await fetch(url, {
      headers: { "X-API-KEY": ENV.apisixApiKey },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { total: 0, routes: [] };
    const data = await res.json() as any;
    const routes = (data?.list ?? data?.node?.nodes ?? []).map((n: any) => n.value ?? n);
    return { total: routes.length, routes };
  } catch {
    return { total: 0, routes: [] };
  }
}

/**
 * Gets APISIX health/status (used by monitoring dashboard)
 */
export async function getApisixHealth(): Promise<{ status: string; version?: string; uptime?: number; connections?: Record<string, number> }> {
  if (!ENV.apisixAdminUrl) return { status: 'unconfigured' };
  try {
    // APISIX control API health endpoint
    const controlUrl = ENV.apisixAdminUrl.replace(':9180', ':9090').replace('/apisix/admin', '');
    const res = await fetch(`${controlUrl}/v1/healthcheck`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return { status: 'degraded' };
    const data = await res.json() as any;
    return { status: 'healthy', ...data };
  } catch {
    return { status: 'unreachable' };
  }
}
