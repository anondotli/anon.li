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

const storageLogger = createLogger("Storage");
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface StorageEnv {
  bucketName: string;
  r2Endpoint: string;
  r2PublicBucketEndpoint: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

let storageEnvCache: StorageEnv | null = null;
let r2Client: S3Client | null = null;
let r2UploadPresignClient: S3Client | null = null;
let r2DownloadPresignClient: S3Client | null = null;
let storageEnvSignature: string | null = null;

function currentStorageEnvSignature(): string {
  return [
    process.env.R2_ACCESS_KEY_ID || "",
    process.env.R2_SECRET_ACCESS_KEY || "",
    process.env.R2_ENDPOINT || "",
    process.env.R2_PUBLIC_ENDPOINT || "",
    process.env.R2_BUCKET_NAME || "",
  ].join("|");
}

function resetStorageClients(): void {
  storageEnvCache = null;
  r2Client = null;
  r2UploadPresignClient = null;
  r2DownloadPresignClient = null;
}

export function resetStorageCacheForTests(): void {
  storageEnvSignature = null;
  resetStorageClients();
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

  const r2PublicEndpoint = requireEnv("R2_PUBLIC_ENDPOINT");
  let r2PublicBucketEndpoint: string;

  try {
    r2PublicBucketEndpoint = new URL(r2PublicEndpoint).origin;
  } catch {
    throw new ServiceUnavailableError("R2_PUBLIC_ENDPOINT must be a valid URL for storage operations");
  }

  storageEnvCache = {
    bucketName: requireEnv("R2_BUCKET_NAME"),
    r2Endpoint: requireEnv("R2_ENDPOINT"),
    r2PublicBucketEndpoint,
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

function getR2UploadPresignClient(): S3Client {
  if (r2UploadPresignClient) {
    return r2UploadPresignClient;
  }

  const env = getStorageEnv();
  r2UploadPresignClient = new S3Client({
    region: "auto",
    endpoint: env.r2Endpoint,
    credentials: env.credentials,
    forcePathStyle: true,
  });

  return r2UploadPresignClient;
}

function getR2DownloadPresignClient(): S3Client {
  if (r2DownloadPresignClient) {
    return r2DownloadPresignClient;
  }

  const env = getStorageEnv();
  r2DownloadPresignClient = new S3Client({
    region: "auto",
    endpoint: env.r2PublicBucketEndpoint,
    credentials: env.credentials,
    bucketEndpoint: true,
  });

  return r2DownloadPresignClient;
}

const PRESIGNED_URL_EXPIRES = 3600; // 1 hour

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
  partNumber: number
): Promise<string> {
  const { bucketName } = getStorageEnv();
  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: storageKey,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return getSignedUrl(getR2UploadPresignClient(), command, { expiresIn: PRESIGNED_URL_EXPIRES });
}

/**
 * Generate presigned URLs for multiple chunks at once
 */
export async function getChunkPresignedUrls(
  storageKey: string,
  uploadId: string,
  partNumbers: number[]
): Promise<Record<number, string>> {
  const urls: Record<number, string> = {};

  await Promise.all(
    partNumbers.map(async (partNumber) => {
      urls[partNumber] = await getChunkPresignedUrl(storageKey, uploadId, partNumber);
    })
  );

  return urls;
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
 * Signed against the R2 custom domain so the browser fetches bytes
 * directly from R2 with native Range support.
 */
export async function getPresignedDownloadUrl(
  storageKey: string,
  expiresIn: number = PRESIGNED_URL_EXPIRES
): Promise<string> {
  const { r2PublicBucketEndpoint } = getStorageEnv();
  const command = new GetObjectCommand({
    // With bucketEndpoint=true, the AWS SDK expects Bucket to be the full
    // bucket endpoint URL, not the logical bucket name.
    Bucket: r2PublicBucketEndpoint,
    Key: storageKey,
  });

  return getSignedUrl(getR2DownloadPresignClient(), command, { expiresIn });
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
  } catch {
    // Object doesn't exist
    return null;
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
