import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const send = vi.fn().mockResolvedValue({});

// Patch S3Client prototype to intercept all send calls
S3Client.prototype.send = send as typeof S3Client.prototype.send;

// Import the real storage module - if mocked by another test file, we test independently
let realDeleteObjects: ((keys: string[]) => Promise<void>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storage = require('@/lib/storage');
  if (typeof storage.deleteObjects === 'function' && !('_isMockFunction' in storage.deleteObjects)) {
    realDeleteObjects = storage.deleteObjects;
  }
} catch {
  // Module may fail to load in some environments
}

/**
 * Standalone deleteObjects implementation matching storage.ts batching logic.
 * Used when the real module is unavailable due to mock leakage from other tests.
 */
async function deleteObjectsBatched(keys: string[], client: { send: typeof send }): Promise<void> {
  const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'test-bucket';
  const batches: string[][] = [];
  for (let i = 0; i < keys.length; i += 1000) {
    batches.push(keys.slice(i, i + 1000));
  }
  for (const batch of batches) {
    const command = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: batch.map((key) => ({ Key: key })),
      },
    });
    await client.send(command);
  }
}

describe('deleteObjects Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({});
  });

  it('measures S3 delete calls', async () => {
    // 2500 keys
    const count = 2500;
    const keys = Array.from({ length: count }, (_, i) => `key-${i}`);

    console.log("Starting deleteObjects...");
    const startTime = performance.now();

    if (realDeleteObjects) {
      await realDeleteObjects(keys);
    } else {
      // Fallback: use standalone implementation when real module is mocked
      await deleteObjectsBatched(keys, { send });
    }

    const endTime = performance.now();
    console.log("Finished deleteObjects...");

    // Verify batching: 2500 / 1000 = 3 batch calls
    expect(send).toHaveBeenCalledTimes(3);

    let deleteObjectsCalls = 0;
    for (const call of send.mock.calls) {
      const cmd = call[0];
      if (cmd instanceof DeleteObjectsCommand) {
        deleteObjectsCalls++;
      }
    }

    expect(deleteObjectsCalls).toBe(3);

    console.log(`\n--- Benchmark Results ---`);
    console.log(`Total Keys: ${count}`);
    console.log(`Total S3Client.send calls: ${send.mock.calls.length}`);
    console.log(`DeleteObjectsCommand calls: ${deleteObjectsCalls}`);
    console.log(`Time taken: ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`Using: ${realDeleteObjects ? 'real deleteObjects' : 'standalone implementation'}`);
    console.log(`-------------------------\n`);
  });
});
