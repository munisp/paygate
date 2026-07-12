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
