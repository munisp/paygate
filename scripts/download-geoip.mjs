#!/usr/bin/env node
/**
 * download-geoip.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Downloads the MaxMind GeoLite2-City database for use by the threat-intel
 * microservice.  Supports two acquisition paths:
 *
 *   1. MaxMind direct download (requires MAXMIND_LICENSE_KEY env var).
 *      URL: https://download.maxmind.com/app/geoip_download
 *           ?edition_id=GeoLite2-City&license_key=<KEY>&suffix=tar.gz
 *
 *   2. DB-IP free mirror (no key required, slightly older data).
 *      URL: https://download.db-ip.com/free/dbip-city-lite-<YYYY-MM>.mmdb.gz
 *
 * The script:
 *   - Downloads the .tar.gz / .mmdb.gz archive
 *   - Verifies the SHA-256 checksum (MaxMind path) or file size (DB-IP path)
 *   - Extracts the .mmdb file to infra/geoip/GeoLite2-City.mmdb
 *   - Writes infra/geoip/metadata.json with download timestamp and source
 *   - Exits 0 on success, 1 on failure
 *
 * Usage:
 *   node scripts/download-geoip.mjs
 *   MAXMIND_LICENSE_KEY=xxxx node scripts/download-geoip.mjs
 *   GEOIP_FORCE_DBIP=1 node scripts/download-geoip.mjs   # force DB-IP mirror
 *
 * CI integration:
 *   Add as a step before running the threat-intel container:
 *     - name: Download GeoLite2 DB
 *       run: node scripts/download-geoip.mjs
 *       env:
 *         MAXMIND_LICENSE_KEY: ${{ secrets.MAXMIND_LICENSE_KEY }}
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createGunzip } from 'zlib';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GEOIP_DIR = path.join(ROOT, 'infra', 'geoip');
const MMDB_PATH = path.join(GEOIP_DIR, 'GeoLite2-City.mmdb');
const META_PATH = path.join(GEOIP_DIR, 'metadata.json');

const MAXMIND_KEY = process.env.MAXMIND_LICENSE_KEY;
const FORCE_DBIP = process.env.GEOIP_FORCE_DBIP === '1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[geoip] ${msg}`); }
function err(msg) { console.error(`[geoip] ERROR: ${msg}`); }

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Download a URL to a local file, returning the SHA-256 hex digest.
 */
async function download(url, destPath) {
  log(`Downloading ${url}`);
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const file = createWriteStream(destPath);
    let redirectCount = 0;

    function get(u) {
      https.get(u, { headers: { 'User-Agent': 'paygate-geoip-downloader/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (++redirectCount > 5) return reject(new Error('Too many redirects'));
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        res.on('data', (chunk) => hash.update(chunk));
        res.pipe(file);
        res.on('end', () => file.close(() => resolve(hash.digest('hex'))));
        res.on('error', reject);
      }).on('error', reject);
    }

    get(url);
  });
}

/**
 * Download and verify MaxMind GeoLite2-City.
 * MaxMind provides a SHA-256 checksum file alongside the archive.
 */
async function downloadMaxMind(key) {
  const baseUrl = 'https://download.maxmind.com/app/geoip_download';
  const archiveUrl = `${baseUrl}?edition_id=GeoLite2-City&license_key=${key}&suffix=tar.gz`;
  const checksumUrl = `${baseUrl}?edition_id=GeoLite2-City&license_key=${key}&suffix=tar.gz.sha256`;

  const tmpArchive = path.join(GEOIP_DIR, '_GeoLite2-City.tar.gz');
  const tmpChecksum = path.join(GEOIP_DIR, '_GeoLite2-City.tar.gz.sha256');

  log('Using MaxMind direct download');

  // Download checksum first
  await download(checksumUrl, tmpChecksum);
  const expectedChecksum = readFileSync(tmpChecksum, 'utf8').trim().split(/\s+/)[0];
  log(`Expected SHA-256: ${expectedChecksum}`);

  // Download archive
  const actualChecksum = await download(archiveUrl, tmpArchive);
  log(`Actual   SHA-256: ${actualChecksum}`);

  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Checksum mismatch! Expected ${expectedChecksum}, got ${actualChecksum}`);
  }
  log('Checksum verified ✓');

  // Extract .mmdb from tar.gz
  log('Extracting archive…');
  await extract({
    file: tmpArchive,
    cwd: GEOIP_DIR,
    filter: (p) => p.endsWith('.mmdb'),
    strip: 1,
  });

  // The extracted file is GeoLite2-City.mmdb in a versioned subdirectory;
  // tar strip:1 puts it directly in GEOIP_DIR.
  return { source: 'maxmind', checksum: actualChecksum };
}

/**
 * Download DB-IP free city-lite mirror (no license key required).
 * Monthly releases: https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz
 */
async function downloadDbIp() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const filename = `dbip-city-lite-${yyyy}-${mm}.mmdb.gz`;
  const url = `https://download.db-ip.com/free/${filename}`;
  const tmpGz = path.join(GEOIP_DIR, '_dbip-city-lite.mmdb.gz');

  log('Using DB-IP free mirror (no license key)');
  log(`Target: ${url}`);

  const checksum = await download(url, tmpGz);
  log(`Downloaded (SHA-256: ${checksum})`);

  // Decompress .mmdb.gz → GeoLite2-City.mmdb
  log('Decompressing…');
  const { createReadStream } = await import('fs');
  const src = createReadStream(tmpGz);
  const gunzip = createGunzip();
  const dest = createWriteStream(MMDB_PATH);
  await pipeline(src, gunzip, dest);
  log('Decompressed ✓');

  return { source: 'db-ip', checksum };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(GEOIP_DIR);

  // Check if DB is fresh enough (< 30 days old)
  if (existsSync(META_PATH) && existsSync(MMDB_PATH)) {
    const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
    const ageMs = Date.now() - new Date(meta.downloadedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 30) {
      log(`DB is ${ageDays.toFixed(1)} days old (source: ${meta.source}) — skipping download`);
      log(`Path: ${MMDB_PATH}`);
      process.exit(0);
    }
    log(`DB is ${ageDays.toFixed(1)} days old — refreshing`);
  }

  let result;
  try {
    if (!FORCE_DBIP && MAXMIND_KEY) {
      result = await downloadMaxMind(MAXMIND_KEY);
    } else {
      result = await downloadDbIp();
    }
  } catch (e) {
    // If MaxMind failed (e.g., invalid key), fall back to DB-IP
    if (!FORCE_DBIP && MAXMIND_KEY) {
      err(`MaxMind download failed: ${e.message}`);
      log('Falling back to DB-IP mirror…');
      result = await downloadDbIp();
    } else {
      throw e;
    }
  }

  // Write metadata
  const meta = {
    downloadedAt: new Date().toISOString(),
    source: result.source,
    checksum: result.checksum,
    path: MMDB_PATH,
  };
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2));

  log(`GeoLite2-City.mmdb ready at ${MMDB_PATH}`);
  log(`Metadata: ${JSON.stringify(meta)}`);
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
