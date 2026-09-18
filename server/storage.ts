// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import { ENV } from "./_core/env";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}

// ─── S3/MinIO object listing & deletion ───────────────────────────────────────
// Real implementation against S3-compatible object storage (AWS S3 or MinIO).
// Throws explicitly when storage is not configured — no silent empty lists.

import { ListObjectsV2Command, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

let _s3: S3Client | null = null;

function getS3Config() {
  const endpoint = process.env.S3_ENDPOINT ?? process.env.MINIO_ENDPOINT ?? "";
  const bucket = process.env.S3_BUCKET ?? process.env.MINIO_BUCKET ?? "";
  const region = process.env.S3_REGION ?? "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_SECRET_KEY ?? "";

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Storage list/delete not configured: set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for MinIO)",
    );
  }
  return { endpoint, bucket, region, accessKeyId, secretAccessKey };
}

function getS3Client(): { client: S3Client; bucket: string } {
  const cfg = getS3Config();
  if (!_s3) {
    _s3 = new S3Client({
      region: cfg.region,
      ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  return { client: _s3, bucket: cfg.bucket };
}

export interface StorageObjectInfo {
  key: string;
  size: number;
  lastModified: string | null;
}

/** List objects under a key prefix (handles pagination). */
export async function storageList(prefix: string): Promise<StorageObjectInfo[]> {
  const { client, bucket } = getS3Client();
  const results: StorageObjectInfo[] = [];
  let continuationToken: string | undefined;
  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalizeKey(prefix),
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    for (const obj of resp.Contents ?? []) {
      if (!obj.Key) continue;
      results.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
      });
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);
  return results;
}

/** Delete an object by key. Throws if the delete fails. */
export async function storageDelete(relKey: string): Promise<void> {
  const { client, bucket } = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: normalizeKey(relKey) }));
}
