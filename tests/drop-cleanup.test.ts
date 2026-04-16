import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DropCleanupService } from '@/lib/services/drop-cleanup';
import { prisma } from '@/lib/prisma';
import * as storage from '@/lib/storage';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    drop: {
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
    decrementStorageUsed: vi.fn(),
}));

// Mock logger to prevent real module loading
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}));

 
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops as any);

    // Mock deletes to resolve successfully
    (storage.deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (storage.deleteObjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.drop.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'deleted' } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 } as any);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.drop.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 } as any);

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.drop.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(expiredDrops as any);

    // Mock deleteObjects to fail
    (storage.deleteObjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('S3 error'));

    // Mock individual deleteObject to succeed
    (storage.deleteObject as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await DropCleanupService.cleanupExpiredDrops();

    expect(result.found).toBe(2);
    expect(result.deleted).toBe(2);
    expect(result.errors).toEqual([]);

    // deleteObjects was called (and failed)
    expect(storage.deleteObjects).toHaveBeenCalledTimes(1);

    // deleteMany should NOT be called
    expect(prisma.drop.deleteMany).not.toHaveBeenCalled();

    // deleteObject should be called 2 times (iterative fallback)
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(storage.deleteObject).toHaveBeenCalledWith('key1');
    expect(storage.deleteObject).toHaveBeenCalledWith('key2');

    // prisma.drop.delete should be called 2 times
    expect(prisma.drop.delete).toHaveBeenCalledTimes(2);
  });
});
