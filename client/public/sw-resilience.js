/**
 * PayGate — Resilience Service Worker (Wave 109)
 *
 * Strategies:
 *  - App shell (HTML/JS/CSS):  Cache-First with network update (stale-while-revalidate)
 *  - API GET requests:         Network-First with 5 s timeout, cache fallback
 *  - API POST/mutations:       Network-only; if offline → queue in IndexedDB
 *  - Images/fonts:             Cache-First (long TTL)
 *  - /api/health:              Network-only (never cache)
 *
 * Background Sync:
 *  - Tag: "paygate-offline-sync"
 *  - On sync event: reads IndexedDB queue and replays to /api/mobile/sync
 *
 * Push Notifications:
 *  - Queues notifications received while the app is closed
 *  - Shows actionable notification with "View" and "Dismiss" actions
 */

const CACHE_VERSION = "paygate-v109";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE   = `${CACHE_VERSION}-api`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const SHELL_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
];

const API_CACHE_PATTERNS = [
  /\/api\/trpc\/dashboard\./,
  /\/api\/trpc\/transactions\.list/,
  /\/api\/trpc\/analytics\./,
  /\/api\/trpc\/auth\.me/,
];

const NEVER_CACHE = [
  /\/api\/health/,
  /\/api\/trpc\/.*\.(create|update|delete|approve|reject)/,
  /\/api\/stripe\//,
  /\/api\/nibss\//,
  /\/api\/mobile\/sync/,
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => {
        // Don't fail install if offline.html isn't available yet
      })
    ).then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("paygate-") && !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never cache these
  if (NEVER_CACHE.some((p) => p.test(url.pathname + url.search))) return;

  // Navigation requests → serve shell or offline fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithFallback(request, SHELL_CACHE, "/offline.html"));
    return;
  }

  // API GET requests → network-first with cache fallback
  if (url.pathname.startsWith("/api/") && request.method === "GET") {
    if (API_CACHE_PATTERNS.some((p) => p.test(url.pathname + url.search))) {
      event.respondWith(networkFirstWithTimeout(request, API_CACHE, 5000));
      return;
    }
    // Other API GETs — network only
    return;
  }

  // API mutations (POST/PUT/PATCH/DELETE) — network only; handled by offlineQueueV2
  if (url.pathname.startsWith("/api/") && request.method !== "GET") return;

  // Static assets (JS/CSS/fonts/images) → cache-first
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|svg|webp|gif|ico)$/)
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
});

// ─── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "paygate-offline-sync") {
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  const db = await openQueueDb();
  const pending = await getAllPending(db);
  if (pending.length === 0) return;

  console.log(`[SW] Background sync: replaying ${pending.length} queued operations`);

  try {
    const payload = {
      operations: pending.map((e) => ({
        id: e.id,
        operation: e.procedure,
        payload: e.input,
        idempotency_key: e.id,
        priority: e.priority || "normal",
        created_at: new Date(e.createdAt).toISOString(),
      })),
      device_id: "sw-background-sync",
      merchant_id: 0,
      connection_tier: "background",
    };

    const res = await fetch("/api/mobile/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // Clear all pending entries
      for (const entry of pending) await deleteEntry(db, entry.id);
      console.log(`[SW] Background sync: replayed ${pending.length} operations`);
      // Notify all open clients
      const clients = await self.clients.matchAll();
      clients.forEach((c) => c.postMessage({ type: "SYNC_COMPLETE", count: pending.length }));
    }
  } catch (err) {
    console.warn("[SW] Background sync failed:", err);
    // Will retry on next sync event
  }
}

// ─── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "PayGate", body: event.data.text() };
  }

  const title = payload.title || "PayGate Notification";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    tag: payload.tag || "paygate-notification",
    data: payload.data || {},
    actions: [
      { action: "view", title: "View" },
      { action: "dismiss", title: "Dismiss" },
    ],
    requireInteraction: payload.priority === "critical",
    vibrate: payload.priority === "critical" ? [200, 100, 200] : [100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url === url && "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ─── Cache strategies ─────────────────────────────────────────────────────────

async function networkFirstWithFallback(request, cacheName, fallbackUrl) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match(fallbackUrl);
  }
}

async function networkFirstWithTimeout(request, cacheName, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(new Request(request, { signal: controller.signal }));
    clearTimeout(timer);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    clearTimeout(timer);
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("Network error and no cache available");
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, res.clone());
  }
  return res;
}

// ─── IndexedDB helpers (mirror of offlineQueueV2) ────────────────────────────

const SW_DB_NAME = "paygate-offline-v2";
const SW_STORE = "queue";

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_DB_NAME, 1);
    req.onupgradeneeded = (evt) => {
      const db = evt.target.result;
      if (!db.objectStoreNames.contains(SW_STORE)) {
        db.createObjectStore(SW_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SW_STORE, "readonly");
    const req = tx.objectStore(SW_STORE).getAll();
    req.onsuccess = () =>
      resolve(
        req.result.filter((e) => e.status === "pending" || e.status === "retrying")
      );
    req.onerror = () => reject(req.error);
  });
}

function deleteEntry(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SW_STORE, "readwrite");
    tx.objectStore(SW_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
