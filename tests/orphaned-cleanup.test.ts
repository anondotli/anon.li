import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DropCleanupService } from '@/lib/services/drop-cleanup';
import { prisma } from '@/lib/prisma';
import * as storage from '@/lib/storage';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    orphanedFile: {
      findMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// Mock storage
vi.mock('@/lib/storage', () => ({
    deleteObject: vi.fn(),
    deleteObjects: vi.fn(),
}));

// Mock drop-storage
vi.mock('@/lib/services/drop-storage', () => ({
    decrementStorageUsed: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}));

describe('DropCleanupService.cleanupOrphanedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should cleanup orphaned files (batch)', async () => {
    const orphanedFiles = [
      { id: '1', storageKey: 'key1' },
      { id: '2', storageKey: 'key2' },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.orphanedFile.findMany as any).mockResolvedValue(orphanedFiles);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (storage.deleteObjects as any).mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.orphanedFile.deleteMany as any).mockResolvedValue({ count: 2 });

    const result = await DropCleanupService.cleanupOrphanedFiles();

    expect(result.found).toBe(2);
    expect(result.deleted).toBe(2);
    expect(result.errors).toEqual([]);

    expect(storage.deleteObjects).toHaveBeenCalledWith(['key1', 'key2']);
    expect(prisma.orphanedFile.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['1', '2'] } },
    });
  });

  it('should handle empty list', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.orphanedFile.findMany as any).mockResolvedValue([]);

    const result = await DropCleanupService.cleanupOrphanedFiles();

    expect(result.found).toBe(0);
    expect(result.deleted).toBe(0);
    expect(storage.deleteObjects).not.toHaveBeenCalled();
  });

  it('should fallback to iterative cleanup if batch fails', async () => {
    const orphanedFiles = [
      { id: '1', storageKey: 'key1' },
      { id: '2', storageKey: 'key2' },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.orphanedFile.findMany as any).mockResolvedValue(orphanedFiles);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (storage.deleteObjects as any).mockRejectedValue(new Error('S3 Error'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (storage.deleteObject as any).mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.orphanedFile.delete as any).mockResolvedValue({ id: '1' });

    const result = await DropCleanupService.cleanupOrphanedFiles();

    expect(result.found).toBe(2);
    expect(result.deleted).toBe(2);
    expect(result.errors).toEqual([]);

    expect(storage.deleteObjects).toHaveBeenCalled();
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(storage.deleteObject).toHaveBeenCalledWith('key1');
    expect(storage.deleteObject).toHaveBeenCalledWith('key2');
    expect(prisma.orphanedFile.delete).toHaveBeenCalledTimes(2);
  });
});
