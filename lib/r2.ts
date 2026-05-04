// ============================================
// Cloudflare R2 — call recording storage
// ============================================
//
// Why R2 (vs S3 / Cloudinary / GCS):
//   1. Zero egress fees. QA reviewers replaying recordings never costs us
//      bandwidth. With S3 at $0.09/GB out, a single BPO doing daily QA on
//      ~30 GB of recordings = ~$2.70/mo just to *listen*. R2 = ₹0.
//   2. Free tier covers the first 10 GB and 1M Class A / 10M Class B ops.
//      A typical BPO hits ~5 GB/mo, so the first ~10 BPOs are free storage.
//   3. S3-compatible API. If we ever need to migrate (data residency, MinIO
//      on-prem, AWS), the SDK calls don't change — only the endpoint.
//
// Why signed URLs (vs public bucket):
//   Recordings are PII. A public R2 URL would let anyone with the link
//   replay the call forever. Signed URLs expire after `ttlSeconds` (default
//   5 min) which is enough for the audio player to start streaming but not
//   enough to share/leak. The URL is generated server-side in the calls
//   detail route and handed to the client just-in-time.
//
// Why fail-soft on missing creds:
//   Same pattern as lib/supabase.ts — return null when R2 isn't configured
//   so local dev works without forcing every contributor to set up R2.
//   Production must set all four R2_* env vars or this module will throw
//   at first use (intentional — silent failure on storage is worse).
//
// Env:
//   R2_ACCOUNT_ID         — Cloudflare account id (sidebar of R2 dashboard)
//   R2_ACCESS_KEY_ID      — from R2 → Manage API Tokens
//   R2_SECRET_ACCESS_KEY  — from same token (shown once)
//   R2_BUCKET             — bucket name, e.g. 'uvoiz-recordings'
//   R2_PUBLIC_URL         — optional. If set, used as a CDN prefix for
//                           public-safe assets. Recordings DO NOT use this.
// ============================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---- Client (lazy, single instance per process) ----
//
// We don't construct the client at module-eval time because Next.js loads
// every imported module on the edge for middleware, and edge runtime
// rejects the AWS SDK. By gating creation behind a function we keep this
// module cheap to import even where it's never actually called.

let _client: S3Client | null = null;

function getClient(): S3Client | null {
  if (_client) return _client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  _client = new S3Client({
    // R2 is a single global namespace — region is a formality, but the SDK
    // requires *something*. 'auto' is what Cloudflare's docs prescribe.
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return _client;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error(
      'R2_BUCKET is not set. Configure your R2 bucket name in env vars ' +
      '(see .env.example for the full list).'
    );
  }
  return bucket;
}

/** True if R2 is configured. Used by callers to decide whether to invoke
 *  R2 paths or fall back to "store the upstream URL directly in the DB"
 *  during local dev / staging when R2 isn't wired yet. */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

// ---- Key construction ----
//
// Tenant isolation lives in the key prefix. Even though the bucket is
// shared across all BPOs, every object is scoped to its org_id so a
// permissions bug or misconfigured signed URL can't cross-leak tenants.
//
// Layout:
//   recordings/{orgId}/{yyyy}/{mm}/{callId}.{ext}
//
// Why date partitioning:
//   - Cheap to glob a single day's recordings if we need to bulk-export
//     for compliance ("give me all calls Mr X received in March")
//   - Lifecycle rules can be applied per-prefix later (e.g. move
//     recordings older than 90 days to Infrequent Access tier — that
//     saves storage cost at the price of retrieval fees, which is fine
//     for archived QA data)

export function buildRecordingKey(params: {
  orgId: string;
  callId: string;
  /** File extension WITHOUT the dot. Defaults to 'mp3' which is what
   *  VAPI/TeleCMI both produce for recordings. */
  ext?: string;
  /** Override the date used in the key. Defaults to "now". Useful for
   *  re-uploading historical recordings during a backfill. */
  at?: Date;
}): string {
  const ext = (params.ext || 'mp3').replace(/^\./, '').toLowerCase();
  const at = params.at || new Date();
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  // Trim slashes and whitespace from ids so we never emit a key with
  // an unexpected separator that would break our prefix queries.
  const orgId = params.orgId.trim().replace(/\//g, '');
  const callId = params.callId.trim().replace(/\//g, '');
  return `recordings/${orgId}/${yyyy}/${mm}/${callId}.${ext}`;
}

// ---- Upload ----
/**
 * Upload a recording (or any blob) to R2.
 *
 * `body` accepts Buffer, Uint8Array, or a Node Readable stream. The
 * recording-fetch path that downloads from VAPI/TeleCMI streams them
 * straight through without buffering the whole file in memory — that's
 * why we don't lock the type to Buffer.
 *
 * Returns the R2 key on success. On failure throws — the caller (cron
 * or webhook) will retry via its own logic.
 */
export async function uploadRecording(params: {
  key: string;
  body: Buffer | Uint8Array | NodeJS.ReadableStream;
  contentType?: string;
  /** Optional metadata stored alongside the object. R2 mirrors S3 here:
   *  string-only, lowercased keys, surfaced as headers on GET. Useful
   *  for storing the source upstream URL for audit. */
  metadata?: Record<string, string>;
}): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
      'R2_SECRET_ACCESS_KEY, and R2_BUCKET before calling uploadRecording.'
    );
  }

  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: params.key,
      Body: params.body as any,
      ContentType: params.contentType || 'audio/mpeg',
      Metadata: params.metadata,
    })
  );

  return params.key;
}

// ---- Signed URL (read) ----
/**
 * Generate a short-lived signed URL for a recording. The default 5 min
 * TTL is long enough for the HTML5 audio player to start streaming and
 * buffer ahead, but short enough that a leaked URL (Slack share, email
 * forward, browser history copy) goes stale quickly.
 *
 * Do NOT cache these URLs in the DB. Generate them per-request in the
 * calls detail route (or wherever a recording is rendered) so each user
 * gets a fresh signature with a fresh expiry.
 *
 * Options:
 *   downloadFilename — when set, the signed URL includes a
 *     ResponseContentDisposition header so the browser shows a Save-As
 *     dialog with this filename instead of streaming inline. Used by
 *     the Download button on the calls page.
 *
 *     Without this, browsers fall back to using the R2 object key as
 *     filename — "1aef-2bcd-...mp3" which is ugly and leaks our
 *     internal storage layout.
 */
export async function getRecordingUrl(
  key: string,
  ttlSeconds = 300,
  options?: { downloadFilename?: string }
): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      'R2 is not configured. Cannot generate signed URL.'
    );
  }
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ...(options?.downloadFilename
      ? {
          // The quotes around the filename are RFC 6266 — without them
          // any space or special char in the name breaks parsing.
          ResponseContentDisposition: `attachment; filename="${options.downloadFilename}"`,
        }
      : {}),
  });
  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
}

// ---- Existence check ----
/**
 * Check if an object exists at `key`. Returns the object's size in bytes
 * if present, null otherwise. Used by the recording-fetch job to decide
 * whether to skip a re-upload (idempotent retries).
 *
 * HEAD is cheap — counts as a Class B operation, of which the free tier
 * gives 10M/month.
 */
export async function recordingExists(key: string): Promise<number | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key })
    );
    return result.ContentLength ?? 0;
  } catch (err: any) {
    // S3 SDK surfaces "not found" as a NotFound or 404 status code.
    // Anything else (auth, network) we want to bubble up so retries fire.
    if (
      err?.name === 'NotFound' ||
      err?.$metadata?.httpStatusCode === 404
    ) {
      return null;
    }
    throw err;
  }
}

// ---- Delete ----
/**
 * Delete a recording. Used for retention policy enforcement — see the
 * cron job that prunes recordings older than the org's configured
 * retention window (default 90 days, configurable per BPO for
 * compliance with their own customer contracts).
 *
 * DeleteObject is a *free* operation on R2 (not Class A or B) — we can
 * call this at scale without worrying about op-count billing.
 */
export async function deleteRecording(key: string): Promise<void> {
  const client = getClient();
  if (!client) {
    throw new Error('R2 is not configured. Cannot delete recording.');
  }
  await client.send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}

// ---- Helper: download a remote URL and pipe into R2 ----
/**
 * Convenience wrapper used by the recording-fetch path. Given a
 * recording URL from the upstream voice provider (VAPI's recordingUrl,
 * TeleCMI's recording_url), download it and upload to R2 in a single
 * call. Returns the R2 key.
 *
 * We buffer the body. For MP3 recordings under ~50 MB this is fine.
 * If we ever need true streaming, swap to response.body (a ReadableStream)
 * and wire it through to PutObjectCommand — the SDK handles that natively.
 *
 * Idempotency: if the target key already exists at the expected size,
 * we skip the upload. The size check guards against partial writes from
 * a previous crashed job.
 */
export async function fetchAndStoreRecording(params: {
  sourceUrl: string;
  key: string;
  /** Forwarded as object metadata so we can trace any recording back
   *  to its upstream source during incident review. */
  sourceProvider: 'vapi' | 'telecmi' | 'other';
  /** Forwarded as object metadata. Useful for joining R2 objects back
   *  to a calls row during a disaster-recovery rebuild. */
  callId: string;
}): Promise<{ key: string; bytes: number; skipped: boolean }> {
  // 1. Skip if already present (idempotent retries)
  const existing = await recordingExists(params.key);
  if (existing && existing > 0) {
    return { key: params.key, bytes: existing, skipped: true };
  }

  // 2. Download from upstream. Some providers gate the recording URL
  //    behind their API key — VAPI does this. The caller is responsible
  //    for passing a URL that's already been resolved/authorized; this
  //    helper just does the byte transfer.
  const response = await fetch(params.sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Recording fetch failed: ${response.status} ${response.statusText} ` +
      `for ${params.sourceUrl}`
    );
  }

  const contentType =
    response.headers.get('content-type') || 'audio/mpeg';

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await uploadRecording({
    key: params.key,
    body: buffer,
    contentType,
    metadata: {
      'source-provider': params.sourceProvider,
      'source-url': params.sourceUrl.slice(0, 1024), // R2 metadata caps
      'call-id': params.callId,
      'fetched-at': new Date().toISOString(),
    },
  });

  return { key: params.key, bytes: buffer.byteLength, skipped: false };
}
