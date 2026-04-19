/**
 * Subdomain Middleware — Wave 29
 * Resolves Host header to a partner tenant and injects branding CSS variables.
 * e.g. acme.paygate.io → resolves to tenant "acme" → injects CSS vars
 */
import type { Request, Response, NextFunction } from "express";
import { getDb } from "./db";

// In-memory branding cache (5 min TTL)
interface BrandingEntry {
  tenant: any;
  css: string;
  cachedAt: number;
}
const brandingCache = new Map<string, BrandingEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveTenantByHost(host: string): Promise<any | null> {
  // Strip port if present
  const hostname = host.split(":")[0];

  // Check cache
  const cached = brandingCache.get(hostname);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.tenant;
  }

  try {
    const db = await getDb();

    // Try slug-based subdomain first (e.g. acme.paygate.io → slug = "acme")
    const parts = hostname.split(".");
    const slug = parts.length >= 3 ? parts[0] : null;

    let rows: any[] = [];

    if (slug && slug !== "www" && slug !== "api") {
      const result = await db.execute(
        `SELECT id, name, slug, logo_url, primary_color, secondary_color, accent_color, font_family, custom_domain, plan, status
         FROM partner_tenants WHERE slug = $1 AND status = 'active'`,
        [slug]
      ) as any;
      rows = result.rows ?? [];
    }

    // Fall back to custom domain lookup
    if (rows.length === 0) {
      const result = await db.execute(
        `SELECT id, name, slug, logo_url, primary_color, secondary_color, accent_color, font_family, custom_domain, plan, status
         FROM partner_tenants WHERE custom_domain = $1 AND status = 'active'`,
        [hostname]
      ) as any;
      rows = result.rows ?? [];
    }

    const tenant = rows[0] ?? null;

    if (tenant) {
      const css = generateCssVariables(tenant);
      brandingCache.set(hostname, { tenant, css, cachedAt: Date.now() });
    }

    return tenant;
  } catch {
    return null;
  }
}

function generateCssVariables(tenant: any): string {
  return `:root {
  --tenant-primary: ${tenant.primary_color ?? "#6366f1"};
  --tenant-secondary: ${tenant.secondary_color ?? "#8b5cf6"};
  --tenant-accent: ${tenant.accent_color ?? "#06b6d4"};
  --tenant-font: '${tenant.font_family ?? "Inter"}', sans-serif;
  --tenant-name: "${tenant.name ?? "PayGate"}";
}`;
}

/**
 * Express middleware that:
 * 1. Resolves tenant from Host header
 * 2. Attaches tenant to req.tenant
 * 3. Injects X-Tenant-Id and X-Tenant-Branding headers
 */
export async function subdomainMiddleware(req: Request, res: Response, next: NextFunction) {
  const host = req.headers.host ?? "";

  // Skip for localhost and direct IP access
  if (!host || host.startsWith("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(host)) {
    return next();
  }

  try {
    const tenant = await resolveTenantByHost(host);
    if (tenant) {
      (req as any).tenant = tenant;
      res.setHeader("X-Tenant-Id", tenant.id);
      res.setHeader("X-Tenant-Slug", tenant.slug);
    }
  } catch {
    // Non-blocking — continue without tenant context
  }

  next();
}

/**
 * Express route handler: GET /api/tenant/branding/:slug
 * Returns CSS variables for a tenant slug (public endpoint for white-label embed)
 */
export async function tenantBrandingHandler(req: Request, res: Response) {
  const { slug } = req.params;

  // Check cache
  const cached = brandingCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    res.setHeader("Content-Type", "text/css");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(cached.css);
  }

  try {
    const db = await getDb();
    const result = await db.execute(
      `SELECT id, name, slug, logo_url, primary_color, secondary_color, accent_color, font_family
       FROM partner_tenants WHERE slug = $1 AND status = 'active'`,
      [slug]
    ) as any;
    const rows = result.rows ?? [];

    if (!rows[0]) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const css = generateCssVariables(rows[0]);
    brandingCache.set(slug, { tenant: rows[0], css, cachedAt: Date.now() });

    res.setHeader("Content-Type", "text/css");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(css);
  } catch (err) {
    return res.status(500).json({ error: "Failed to load branding" });
  }
}

/**
 * Express route handler: GET /api/tenant/branding/:slug/json
 * Returns branding as JSON (for React components)
 */
export async function tenantBrandingJsonHandler(req: Request, res: Response) {
  const { slug } = req.params;

  try {
    const db = await getDb();
    const result = await db.execute(
      `SELECT id, name, slug, logo_url, primary_color, secondary_color, accent_color, font_family, custom_domain
       FROM partner_tenants WHERE slug = $1 AND status = 'active'`,
      [slug]
    ) as any;
    const rows = result.rows ?? [];

    if (!rows[0]) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    return res.json({ tenant: rows[0], css: generateCssVariables(rows[0]) });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load branding" });
  }
}

/**
 * Prometheus metrics endpoint: GET /api/metrics
 * Returns Prometheus text format metrics
 */
export async function prometheusMetricsHandler(_req: Request, res: Response) {
  try {
    const db = await getDb();

    const usageResult = await db.execute(
      `SELECT tenant_id, SUM(api_calls) as total_calls, SUM(tx_count) as total_tx
       FROM tenant_usage_metrics GROUP BY tenant_id`
    ) as any;

    const cbResult = await db.execute(
      `SELECT status, COUNT(*) as count FROM chargebacks GROUP BY status`
    ) as any;

    const slaResult = await db.execute(
      `SELECT service_name, AVG(uptime_pct) as uptime, AVG(avg_latency_ms) as latency
       FROM sla_metrics WHERE metric_date = CURRENT_DATE GROUP BY service_name`
    ) as any;

    const usageRows = usageResult.rows ?? [];
    const cbRows = cbResult.rows ?? [];
    const slaRows = slaResult.rows ?? [];

    let text = `# HELP paygate_tenant_api_calls_total Total API calls per tenant\n`;
    text += `# TYPE paygate_tenant_api_calls_total counter\n`;
    for (const r of usageRows) {
      text += `paygate_tenant_api_calls_total{tenant_id="${r.tenant_id}"} ${r.total_calls ?? 0}\n`;
    }

    text += `\n# HELP paygate_tenant_tx_count_total Total transactions per tenant\n`;
    text += `# TYPE paygate_tenant_tx_count_total counter\n`;
    for (const r of usageRows) {
      text += `paygate_tenant_tx_count_total{tenant_id="${r.tenant_id}"} ${r.total_tx ?? 0}\n`;
    }

    text += `\n# HELP paygate_chargebacks_total Total chargebacks by status\n`;
    text += `# TYPE paygate_chargebacks_total gauge\n`;
    for (const r of cbRows) {
      text += `paygate_chargebacks_total{status="${r.status}"} ${r.count}\n`;
    }

    text += `\n# HELP paygate_sla_uptime_pct Service uptime percentage today\n`;
    text += `# TYPE paygate_sla_uptime_pct gauge\n`;
    for (const r of slaRows) {
      text += `paygate_sla_uptime_pct{service="${r.service_name}"} ${Number(r.uptime ?? 100).toFixed(4)}\n`;
    }

    text += `\n# HELP paygate_sla_latency_ms Average API latency in milliseconds today\n`;
    text += `# TYPE paygate_sla_latency_ms gauge\n`;
    for (const r of slaRows) {
      text += `paygate_sla_latency_ms{service="${r.service_name}"} ${Number(r.latency ?? 0).toFixed(1)}\n`;
    }

    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    return res.send(text);
  } catch (err) {
    return res.status(500).send("# Error generating metrics\n");
  }
}

export function clearBrandingCache(slug?: string) {
  if (slug) {
    brandingCache.delete(slug);
  } else {
    brandingCache.clear();
  }
}
