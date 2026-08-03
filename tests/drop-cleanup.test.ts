import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DropCleanupService } from '@/lib/services/drop-cleanup';
import { prisma } from '@/lib/prisma';
import * as storage from '@/lib/storage';
import {
  deleteDropFileAndReleaseQuota,
  deleteDropFilesAndReleaseQuota,
} from '@/lib/services/drop-storage';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    drop: {
      count: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    dropFile: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    orphanedFile: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Mock storage
vi.mock('@/lib/storage', () => ({
    abortMultipartUpload: vi.fn(),
    deleteObject: vi.fn(),
    deleteObjects: vi.fn(),
    getPresignedDownloadUrl: vi.fn(),
}));

// Mock drop-storage
vi.mock('@/lib/services/drop-storage', () => ({
    deleteDropFileAndReleaseQuota: vi.fn().mockResolvedValue({
      storageKey: 'claimed-key',
      s3UploadId: null,
      size: BigInt(1),
    }),
    deleteDropFilesAndReleaseQuota: vi.fn().mockResolvedValue({
      files: [],
      deletedFiles: 0,
      releasedBytes: BigInt(0),
    }),
}));

// Mock logger to prevent real module loading
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}));

const claimDrop = deleteDropFilesAndReleaseQuota as ReturnType<typeof vi.fn>;
const claimFile = deleteDropFileAndReleaseQuota as ReturnType<typeof vi.fn>;
const claimed = (...files: Array<{ storageKey: string; s3UploadId?: string | null; size?: bigint }>) => ({
  files: files.map((file) => ({
    storageKey: file.storageKey,
    s3UploadId: file.s3UploadId ?? null,
    size: file.size ?? BigInt(1),
  })),
  deletedFiles: files.length,
  releasedBytes: files.reduce((total, file) => total + (file.size ?? BigInt(1)), BigInt(0)),
});

 
describe('DropCleanupService.cleanupExpiredDrops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should cleanup expired drops (optimized batch)', async () => {
    // Setup mock data
    const expiredDrops = [
      {
        id: 'drop1',
        files: [{ id: 'file1', storageKey: 'key1' }, { id: 'file2', storageKey: 'key2' }],
      },
      {
        id: 'drop2',
        files: [{ id: 'file3', storageKey: 'key3' }],
      },
    ];

    // Mock findMany to return the expired drops
    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops);

    // Mock deletes to resolve successfully
    (storage.deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (storage.deleteObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    claimDrop
      .mockResolvedValueOnce(claimed({ storageKey: 'key1' }, { storageKey: 'key2' }))
      .mockResolvedValueOnce(claimed({ storageKey: 'key3' }));
    (prisma.drop.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'deleted' });
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });

    const result = await DropCleanupService.cleanupExpiredDrops();

    expect(result.found).toBe(2);
    expect(result.deleted).toBe(2);
    expect(result.errors).toEqual([]);

    // Check calls - verify optimized behavior
    expect(prisma.drop.findMany).toHaveBeenCalledTimes(1);

    // We expect ONE deleteObjects call with all keys
    expect(storage.deleteObjects).toHaveBeenCalledTimes(1);
    expect(storage.deleteObjects).toHaveBeenCalledWith(['key1', 'key2', 'key3']);

    // We expect ONE deleteMany call with all IDs
    expect(prisma.drop.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.drop.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['drop1', 'drop2'] } } });

    // Ensure individual delete calls are NOT used
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.drop.delete).not.toHaveBeenCalled();
  });

  it('should handle drops with no files', async () => {
    // Setup mock data
    const expiredDrops = [
      {
        id: 'drop1',
        files: [],
      },
    ];

    // Mock findMany to return the expired drops
    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops);
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    claimDrop.mockResolvedValueOnce(claimed());

    const result = await DropCleanupService.cleanupExpiredDrops();

    expect(result.found).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.errors).toEqual([]);

    // deleteObjects should NOT be called since no files
    expect(storage.deleteObjects).not.toHaveBeenCalled();

    // deleteMany should be called
    expect(prisma.drop.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.drop.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['drop1'] } } });
  });

  it('should fall back to iterative cleanup if batch delete fails', async () => {
    // Setup mock data
    const expiredDrops = [
      {
        id: 'drop1',
        files: [{ id: 'file1', storageKey: 'key1' }],
      },
       {
        id: 'drop2',
        files: [{ id: 'file2', storageKey: 'key2' }],
      },
    ];

    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops);

    // Mock deleteObjects to fail
    (storage.deleteObjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('S3 error'));

    // Mock individual deleteObject to succeed
    (storage.deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });
    claimDrop
      .mockResolvedValueOnce(claimed({ storageKey: 'key1' }))
      .mockResolvedValueOnce(claimed({ storageKey: 'key2' }));

    const result = await DropCleanupService.cleanupExpiredDrops();

    expect(result.found).toBe(2);
    expect(result.deleted).toBe(2);
    expect(result.errors).toEqual([]);

    // deleteObjects was called (and failed)
    expect(storage.deleteObjects).toHaveBeenCalledTimes(1);

    // deleteObject should be called 2 times (iterative fallback)
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(storage.deleteObject).toHaveBeenCalledWith('key1');
    expect(storage.deleteObject).toHaveBeenCalledWith('key2');

    // Storage fallback does not forfeit the batched, idempotent parent delete.
    expect(prisma.drop.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('counts only parent rows this cleanup won when another deletion races it', async () => {
    const expiredDrops = [
      { id: 'drop1', files: [{ id: 'file1', storageKey: 'key1', size: BigInt(10) }] },
      { id: 'drop2', files: [{ id: 'file2', storageKey: 'key2', size: BigInt(20) }] },
    ];

    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops);
    (storage.deleteObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // One parent was concurrently removed after this worker selected it.
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    claimDrop
      .mockResolvedValueOnce(claimed({ storageKey: 'key1' }))
      .mockResolvedValueOnce(claimed({ storageKey: 'key2' }));

    const result = await DropCleanupService.cleanupExpiredDrops();

    expect(result).toEqual({ found: 2, deleted: 1, errors: [] });
    expect(deleteDropFilesAndReleaseQuota).toHaveBeenCalledTimes(2);
    expect(deleteDropFilesAndReleaseQuota).toHaveBeenNthCalledWith(1, 'drop1');
    expect(deleteDropFilesAndReleaseQuota).toHaveBeenNthCalledWith(2, 'drop2');
  });

  it('releases logical quota and records an orphan when R2 returns a failed key', async () => {
    const expiredDrops = [
      { id: 'drop1', files: [{ id: 'file1', storageKey: 'key1', size: BigInt(10) }] },
    ];

    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops);
    (storage.deleteObjects as ReturnType<typeof vi.fn>).mockResolvedValue(['key1']);
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    claimDrop.mockResolvedValueOnce(claimed({ storageKey: 'key1' }));

    await expect(DropCleanupService.cleanupExpiredDrops()).resolves.toEqual({
      found: 1,
      deleted: 1,
      errors: [],
    });

    expect(prisma.orphanedFile.create).toHaveBeenCalledWith({ data: { storageKey: 'key1' } });
    expect(deleteDropFilesAndReleaseQuota).toHaveBeenCalledWith('drop1');
  });

  it('counts dry-run candidates once instead of polling the same full batch forever', async () => {
    (prisma.drop.count as ReturnType<typeof vi.fn>).mockResolvedValue(137);

    await expect(DropCleanupService.cleanupExpiredDrops(true)).resolves.toEqual({
      found: 137,
      deleted: 0,
      errors: [],
    });
    expect(prisma.drop.findMany).not.toHaveBeenCalled();
  });

  it('stops after a database claim error instead of retrying a full failing batch forever', async () => {
    const expiredDrops = Array.from({ length: 100 }, (_, index) => ({ id: `drop${index}` }));
    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops);
    claimDrop
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(claimed());
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 99 });

    await expect(DropCleanupService.cleanupExpiredDrops()).resolves.toMatchObject({
      found: 100,
      deleted: 99,
      errors: ['drop0'],
    });
    expect(prisma.drop.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('DropCleanupService.cleanupSoftDeletedDrops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects only truly eligible rows in SQL so broad first-page rows cannot starve cleanup', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'eligible-after-noise' }]);
    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'eligible-after-noise',
        userId: 'user1',
        downloads: 2,
        maxDownloads: 2,
        deletedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        files: [{ id: 'file1', storageKey: 'key1', size: BigInt(10) }],
      },
    ]);
    (storage.deleteObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    claimDrop.mockResolvedValueOnce(claimed({ storageKey: 'key1', size: BigInt(10) }));

    await expect(DropCleanupService.cleanupSoftDeletedDrops()).resolves.toEqual({
      found: 1,
      deleted: 1,
      errors: [],
    });

    const sql = ((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as TemplateStringsArray).join('?');
    expect(sql).toContain('"downloads" >= "maxDownloads"');
    expect(sql).toContain('ORDER BY "deletedAt" ASC');
    expect(prisma.drop.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['eligible-after-noise'] } },
    }));
  });

  it('counts all eligible rows once in dry-run mode instead of looping on the first batch', async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ count: BigInt(137) }]);

    await expect(DropCleanupService.cleanupSoftDeletedDrops(true)).resolves.toEqual({
      found: 137,
      deleted: 0,
      errors: [],
    });
    expect(prisma.drop.findMany).not.toHaveBeenCalled();
  });
});

describe('DropCleanupService.cleanupIncompleteFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims the database row before deleting its returned storage object', async () => {
    (prisma.dropFile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'file1',
        storageKey: 'stale-selected-key',
        s3UploadId: 'stale-selected-upload',
        size: BigInt(10),
        drop: { userId: 'user1' },
      },
    ]);
    claimFile.mockResolvedValueOnce({
      storageKey: 'claimed-key',
      s3UploadId: 'claimed-upload',
      size: BigInt(10),
    });
    (storage.abortMultipartUpload as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (storage.deleteObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(DropCleanupService.cleanupIncompleteFiles()).resolves.toEqual({
      found: 1,
      deleted: 1,
      errors: [],
    });

    expect(deleteDropFileAndReleaseQuota).toHaveBeenCalledWith('file1');
    expect(storage.abortMultipartUpload).toHaveBeenCalledWith('claimed-key', 'claimed-upload');
    expect(storage.deleteObjects).toHaveBeenCalledWith(['claimed-key']);
    expect(claimFile.mock.invocationCallOrder[0]).toBeLessThan(
      (storage.deleteObjects as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!,
    );
  });

  it('does not touch storage when another worker already claimed the row', async () => {
    (prisma.dropFile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'file1',
        storageKey: 'stale-selected-key',
        s3UploadId: 'stale-selected-upload',
        size: BigInt(10),
        drop: { userId: 'user1' },
      },
    ]);
    claimFile.mockResolvedValueOnce(null);

    await expect(DropCleanupService.cleanupIncompleteFiles()).resolves.toEqual({
      found: 1,
      deleted: 0,
      errors: [],
    });

    expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    expect(storage.deleteObjects).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('uses an aggregate count for dry runs', async () => {
    (prisma.dropFile.count as ReturnType<typeof vi.fn>).mockResolvedValue(144);

    await expect(DropCleanupService.cleanupIncompleteFiles(true)).resolves.toEqual({
      found: 144,
      deleted: 0,
      errors: [],
    });
    expect(prisma.dropFile.findMany).not.toHaveBeenCalled();
  });
});
