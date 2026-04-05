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
  HeadBucketCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { createLogger } from "@/lib/logger";

const storageLogger = createLogger("Storage");
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Environment is validated at startup by lib/env.ts (validateServerEnv).
// These are guaranteed to be present by the time this module is loaded on
// any real request path; the non-null assertions here just tell TypeScript
// what the schema already enforces.
const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const R2_PUBLIC_ENDPOINT = process.env.R2_PUBLIC_ENDPOINT!;
const R2_CREDENTIALS = {
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
};

// Server-side client — used for multipart init/complete/abort, head, delete.
// Talks directly to the R2 S3-compatible endpoint.
const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: R2_CREDENTIALS,
  forcePathStyle: true,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 5_000,  // 5s to establish connection
    requestTimeout: 30_000,    // 30s for the full request
  }),
});

// Upload presign client — signs browser upload URLs against the R2 endpoint.
// Browsers PUT chunks directly to R2 without touching our servers.
const r2UploadPresignClient = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: R2_CREDENTIALS,
  forcePathStyle: true,
});

// Download presign client
const r2DownloadPresignClient = new S3Client({
  region: "auto",
  endpoint: R2_PUBLIC_ENDPOINT,
  credentials: R2_CREDENTIALS,
  bucketEndpoint: true,
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const PRESIGNED_URL_EXPIRES = 3600; // 1 hour

/**
 * Initiate a multipart upload for a file
 */
export async function initiateMultipartUpload(
  storageKey: string,
  contentType: string
): Promise<string> {
  const command = new CreateMultipartUploadCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
    ContentType: contentType,
  });

  const response = await r2Client.send(command);

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
  const command = new UploadPartCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return getSignedUrl(r2UploadPresignClient, command, { expiresIn: PRESIGNED_URL_EXPIRES });
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
  // Sort parts by part number as required by S3
  const sortedParts = [...parts].sort((a, b) => (a.PartNumber || 0) - (b.PartNumber || 0));

  const command = new CompleteMultipartUploadCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sortedParts,
    },
  });

  await r2Client.send(command);
}

/**
 * Abort a multipart upload (cleanup on failure or cancellation)
 */
export async function abortMultipartUpload(
  storageKey: string,
  uploadId: string
): Promise<void> {
  const command = new AbortMultipartUploadCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
    UploadId: uploadId,
  });

  await r2Client.send(command);
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
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
  });

  return getSignedUrl(r2DownloadPresignClient, command, { expiresIn });
}

/**
 * Delete a file from R2
 */
export async function deleteObject(storageKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
  });

  await r2Client.send(command);
}

/**
 * Verify the configured R2 bucket is reachable and authorized.
 * Used by the /api/health endpoint as a liveness signal for storage.
 * Throws on failure; the caller decides how to surface it.
 */
export async function headBucket(): Promise<void> {
  await r2Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
}

/**
 * Check if an object exists and get its metadata
 */
export async function getObjectMetadata(storageKey: string): Promise<{
  contentLength: number;
  contentType: string;
} | null> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
    });

    const response = await r2Client.send(command);

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
  // S3 DeleteObjects has a limit of 1000 objects per request
  const batches: string[][] = [];
  for (let i = 0; i < storageKeys.length; i += 1000) {
    batches.push(storageKeys.slice(i, i + 1000));
  }

  const failedKeys: string[] = [];

  for (const batch of batches) {
    const command = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
      },
    });

    const response = await r2Client.send(command);

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

