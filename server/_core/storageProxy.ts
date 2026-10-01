import type { Express } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { getMerchantByOwnerId } from "../db";
import { expressRateLimit } from "../rateLimit";

// A4: namespaces whose second key segment is the owning merchant/user id, e.g.
//   dispute-evidence/<merchantId>/<file>   (server/routers.ts)
//   chargeback-evidence/<merchantId>/<id>/<file> (chargebackLifecycle.ts)
//   ap-bills/<merchantId>/<source>/<file>  (routers/apBillInbox.ts)
//   exports/<merchantId>/<file>            (server/routers.ts)
// For these, the segment MUST match the caller's merchant id or user id.
const SCOPED_NAMESPACES = new Set([
  "ap-bills",
  "chargeback-evidence",
  "dispute-evidence",
  "exports",
  "kyc-docs",
  "kyb-docs",
]);

export function registerStorageProxy(app: Express) {
  app.get(
    "/manus-storage/*",
    // A4: rate-limit presigned-redirect requests (they hit the Forge backend).
    expressRateLimit({ max: 60, windowMs: 60_000, keyPrefix: "storage:get" }),
    async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // A4: require an authenticated session — fail loud 401.
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // A4: authorize merchant scope — for merchant-scoped namespaces the
    // second key segment must be the caller's merchant id or user id.
    const segments = key.split("/");
    if (segments.length >= 2 && SCOPED_NAMESPACES.has(segments[0])) {
      const ownerSegment = segments[1];
      const merchant = await getMerchantByOwnerId(user.id).catch(() => null);
      const allowed = new Set(
        [String(user.id), merchant?.id].filter((v): v is string => Boolean(v)),
      );
      if (!allowed.has(ownerSegment)) {
        console.warn(`[StorageProxy] 403: user ${user.id} denied key ${segments[0]}/${ownerSegment}/…`);
        res.status(403).json({ error: "Storage key is outside your merchant scope" });
        return;
      }
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
