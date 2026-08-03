import "server-only";

import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { createLogger } from "@/lib/logger";
import { ServiceUnavailableError } from "@/lib/api-error-utils";
import {
  AUTH_TAG_SIZE,
  MAX_CHUNKS_PER_FILE,
  MIN_MULTIPART_PART_SIZE,
} from "@/lib/constants";
import { pMapLimit } from "@/lib/async-utils";

const storageLogger = createLogger("Storage");
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface StorageEnv {
  bucketName: string;
  r2Endpoint: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

let storageEnvCache: StorageEnv | null = null;
let r2Client: S3Client | null = null;
let r2PresignClient: S3Client | null = null;
let storageEnvSignature: string | null = null;

function currentStorageEnvSignature(): string {
  return [
    process.env.R2_ACCESS_KEY_ID || "",
    process.env.R2_SECRET_ACCESS_KEY || "",
    process.env.R2_ENDPOINT || "",
    process.env.R2_BUCKET_NAME || "",
  ].join("|");
}

function resetStorageClients(): void {
  storageEnvCache = null;
  r2Client = null;
  r2PresignClient = null;
}

function syncStorageEnvCache(): void {
  const nextSignature = currentStorageEnvSignature();
  if (process.env.NODE_ENV !== "production" && storageEnvSignature && storageEnvSignature !== nextSignature) {
    resetStorageClients();
  }
  storageEnvSignature = nextSignature;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ServiceUnavailableError(`${name} is required for storage operations`);
  }

  return value;
}

function getStorageEnv(): StorageEnv {
  syncStorageEnvCache();
  if (storageEnvCache) {
    return storageEnvCache;
  }

  storageEnvCache = {
    bucketName: requireEnv("R2_BUCKET_NAME"),
    r2Endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  };

  return storageEnvCache;
}

function getR2Client(): S3Client {
  if (r2Client) {
    return r2Client;
  }

  const env = getStorageEnv();
  r2Client = new S3Client({
    region: "auto",
    endpoint: env.r2Endpoint,
    credentials: env.credentials,
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 5_000,
      requestTimeout: 30_000,
    }),
  });

  return r2Client;
}

function getR2PresignClient(): S3Client {
  if (r2PresignClient) {
    return r2PresignClient;
  }

  const env = getStorageEnv();
  r2PresignClient = new S3Client({
    region: "auto",
    endpoint: env.r2Endpoint,
    credentials: env.credentials,
    forcePathStyle: true,
  });

  return r2PresignClient;
}

const DOWNLOAD_PRESIGNED_URL_EXPIRES = 3600; // 1 hour
// R2 follows the S3 maximum of seven days. Large uploads receive all part URLs
// up front, so a one-hour lifetime made the advertised 250 GiB transfer size
// impossible on ordinary connections.
const UPLOAD_PRESIGNED_URL_EXPIRES = 7 * 24 * 60 * 60;
export const UPLOAD_URL_SIGNING_CONCURRENCY = 32;
const MAX_MULTIPART_PART_SIZE = 5 * 1024 * 1024 * 1024;

export interface MultipartUploadPart {
  partNumber: number;
  contentLength: number;
}

/**
 * Build the exact encrypted byte length for every multipart part.
 *
 * `chunkSize` is the plaintext chunk size stored with the Drop file, while
 * `encryptedSize` includes one AES-GCM authentication tag per part. Keeping
 * this calculation on the server lets the presigned URL bind each PUT to the
 * bytes the application reserved quota for.
 */
export function buildMultipartUploadParts(
  encryptedSize: number,
  chunkSize: number,
  chunkCount: number
): MultipartUploadPart[] {
  if (
    !Number.isSafeInteger(encryptedSize) || encryptedSize <= 0 ||
    !Number.isSafeInteger(chunkSize) || chunkSize <= 0 ||
    !Number.isSafeInteger(chunkCount) || chunkCount <= 0 || chunkCount > MAX_CHUNKS_PER_FILE
  ) {
    throw new RangeError("Invalid multipart upload shape");
  }

  const fullPartSize = chunkSize + AUTH_TAG_SIZE;
  const finalPartSize = encryptedSize - ((chunkCount - 1) * fullPartSize);

  if (
    !Number.isSafeInteger(fullPartSize) ||
    finalPartSize <= AUTH_TAG_SIZE ||
    finalPartSize > fullPartSize ||
    fullPartSize > MAX_MULTIPART_PART_SIZE ||
    (chunkCount > 1 && fullPartSize < MIN_MULTIPART_PART_SIZE)
  ) {
    throw new RangeError("Invalid multipart upload shape");
  }

  return Array.from({ length: chunkCount }, (_, index) => ({
    partNumber: index + 1,
    contentLength: index === chunkCount - 1 ? finalPartSize : fullPartSize,
  }));
}

/**
 * Short presigned-URL lifetime for download-limited drops ("burn after N").
 * The actual byte transfer happens at R2, which we can't count, so a long-lived
 * URL would let one issued download be replayed indefinitely within the window
 * and remain valid after the limit is reached. A tight TTL bounds that replay
 * to roughly a single transfer while still allowing slow connections to finish.
 */
export const LIMITED_DROP_PRESIGNED_URL_EXPIRES = 120; // 2 minutes

/**
 * Initiate a multipart upload for a file
 */
export async function initiateMultipartUpload(
  storageKey: string,
  contentType: string
): Promise<string> {
  const { bucketName } = getStorageEnv();
  const command = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: storageKey,
    ContentType: contentType,
  });

  const response = await getR2Client().send(command);

  if (!response.UploadId) {
    throw new Error("Failed to initiate multipart upload");
  }

  return response.UploadId;
}

/**
 * Generate a presigned URL for uploading a single chunk.
 */
async function getChunkPresignedUrl(
  storageKey: string,
  uploadId: string,
  part: MultipartUploadPart
): Promise<string> {
  const { bucketName } = getStorageEnv();
  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: storageKey,
    UploadId: uploadId,
    PartNumber: part.partNumber,
    ContentLength: part.contentLength,
  });

  return getSignedUrl(getR2PresignClient(), command, { expiresIn: UPLOAD_PRESIGNED_URL_EXPIRES });
}

/**
 * Generate presigned URLs for multiple chunks at once
 */
export async function getChunkPresignedUrls(
  storageKey: string,
  uploadId: string,
  parts: readonly MultipartUploadPart[]
): Promise<Record<number, string>> {
  const seenPartNumbers = new Set<number>();
  for (const part of parts) {
    if (
      !Number.isSafeInteger(part.partNumber) ||
      part.partNumber < 1 ||
      part.partNumber > MAX_CHUNKS_PER_FILE ||
      !Number.isSafeInteger(part.contentLength) ||
      part.contentLength <= AUTH_TAG_SIZE ||
      seenPartNumbers.has(part.partNumber)
    ) {
      throw new RangeError("Invalid multipart upload part");
    }
    seenPartNumbers.add(part.partNumber);
  }

  const signedParts = await pMapLimit(
    parts,
    UPLOAD_URL_SIGNING_CONCURRENCY,
    async (part) => [part.partNumber, await getChunkPresignedUrl(storageKey, uploadId, part)] as const,
  );

  return Object.fromEntries(signedParts);
}

/**
 * Complete a multipart upload after all chunks are uploaded
 */
export async function completeMultipartUpload(
  storageKey: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<void> {
  const { bucketName } = getStorageEnv();
  // Sort parts by part number as required by S3
  const sortedParts = [...parts].sort((a, b) => (a.PartNumber || 0) - (b.PartNumber || 0));

  const command = new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: storageKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sortedParts,
    },
  });

  await getR2Client().send(command);
}

/**
 * Abort a multipart upload (cleanup on failure or cancellation)
 */
export async function abortMultipartUpload(
  storageKey: string,
  uploadId: string
): Promise<void> {
  const { bucketName } = getStorageEnv();
  const command = new AbortMultipartUploadCommand({
    Bucket: bucketName,
    Key: storageKey,
    UploadId: uploadId,
  });

  await getR2Client().send(command);
}

/**
 * Generate a presigned URL for downloading a file.
 * The bucket must remain private. Cloudflare only supports S3 presigned URLs
 * on the account's R2 S3 API endpoint; signing a public/custom domain would
 * either fail or let callers bypass application expiry and download limits.
 */
export async function getPresignedDownloadUrl(
  storageKey: string,
  expiresIn: number = DOWNLOAD_PRESIGNED_URL_EXPIRES
): Promise<string> {
  const { bucketName } = getStorageEnv();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
  });

  return getSignedUrl(getR2PresignClient(), command, { expiresIn });
}

/**
 * Delete a file from R2
 */
export async function deleteObject(storageKey: string): Promise<void> {
  const { bucketName } = getStorageEnv();
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: storageKey,
  });

  await getR2Client().send(command);
}

/**
 * Check if an object exists and get its metadata
 */
export async function getObjectMetadata(storageKey: string): Promise<{
  contentLength: number;
  contentType: string;
} | null> {
  try {
    const { bucketName } = getStorageEnv();
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    });

    const response = await getR2Client().send(command);

    return {
      contentLength: response.ContentLength || 0,
      contentType: response.ContentType || "application/octet-stream",
    };
  } catch (error) {
    // Smithy service errors include the HTTP response status in `$metadata`.
    // Only an actual 404 means the object is absent. Authentication failures,
    // R2 outages, timeouts, and other transport errors must remain observable so
    // callers do not mistake a transient failure for a missing object.
    if (
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof error.$metadata === "object" &&
      error.$metadata !== null &&
      "httpStatusCode" in error.$metadata &&
      error.$metadata.httpStatusCode === 404
    ) {
      return null;
    }

    throw error;
  }
}

/**
 * Delete multiple objects (for batch cleanup).
 * Returns array of keys that FAILED to delete (empty on full success).
 * Does not throw on partial failures — callers should handle failed keys
 * (e.g. record as orphaned files, skip quota decrement).
 */
export async function deleteObjects(storageKeys: string[]): Promise<string[]> {
  const { bucketName } = getStorageEnv();
  // S3 DeleteObjects has a limit of 1000 objects per request
  const batches: string[][] = [];
  for (let i = 0; i < storageKeys.length; i += 1000) {
    batches.push(storageKeys.slice(i, i + 1000));
  }

  const failedKeys: string[] = [];

  for (const batch of batches) {
    const command = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
      },
    });

    const response = await getR2Client().send(command);

    if (response.Errors && response.Errors.length > 0) {
      for (const err of response.Errors) {
        if (err.Key) {
          failedKeys.push(err.Key);
          storageLogger.error("Failed to delete object in batch", null, {
            key: err.Key,
            code: err.Code,
            message: err.Message,
          });
        }
      }
    }
  }

  return failedKeys;
}

/**
 * Generate a unique storage key for a file.
 */
export function generateStorageKey(fileId: string): string {
  return fileId;
}
