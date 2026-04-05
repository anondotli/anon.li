import {
  MAX_CHUNKS_PER_FILE,
  MIN_CHUNK_SIZE,
  FILE_SIZE_THRESHOLD_1GB,
  ARGON2_MEMORY,
  ARGON2_TIME,
  ARGON2_PARALLELISM,
  ARGON2_HASH_LENGTH,
  AUTH_TAG_SIZE,
  DROP_PASSWORD_MIN_LENGTH,
} from "@/lib/constants";
import { argon2id } from "hash-wasm";

/**
 * Calculate the encrypted size of a file.
 * Each encrypted chunk adds a 16-byte GCM authentication tag.
 *
 * @param originalSize - The original plaintext file size in bytes
 * @param chunkSize - The chunk size used for encryption
 * @returns The total encrypted size in bytes
 */
export function calculateEncryptedSize(originalSize: number, chunkSize: number): number {
  const chunkCount = Math.ceil(originalSize / chunkSize);
  return originalSize + (chunkCount * AUTH_TAG_SIZE);
}

export const CryptoConfig = {
  ALGORITHM: { name: "AES-GCM", length: 256 },

  // Argon2id parameters for key derivation
  KDF: {
    name: "Argon2id",
    memory: ARGON2_MEMORY,
    iterations: ARGON2_TIME,
    parallelism: ARGON2_PARALLELISM,
    hashLength: ARGON2_HASH_LENGTH,
  },

  // IV Lengths in bytes
  IV_LENGTH: 12,
  SALT_LENGTH: 32,

  getChunkParams(fileSize: number): { chunkSize: number; chunkCount: number } {
    // Small files: single chunk
    if (fileSize <= MIN_CHUNK_SIZE) {
      return { chunkSize: fileSize || 1, chunkCount: 1 };
    }

    // Calculate minimum chunks needed with 50MB size
    const chunksNeeded = Math.ceil(fileSize / MIN_CHUNK_SIZE);

    if (chunksNeeded <= MAX_CHUNKS_PER_FILE) {
      // Fits within limit - use even distribution
      return {
        chunkSize: Math.ceil(fileSize / chunksNeeded),
        chunkCount: chunksNeeded,
      };
    } else {
      // Exceeds limit - use max chunks with larger size
      return {
        chunkSize: Math.ceil(fileSize / MAX_CHUNKS_PER_FILE),
        chunkCount: MAX_CHUNKS_PER_FILE,
      };
    }
  },

  getConcurrency(fileSize: number): number {
    return fileSize < FILE_SIZE_THRESHOLD_1GB ? 3 : 5;
  }
};

class FileEncryptionService {

  constructor() {
    this.ensureSupported();
  }

  private ensureSupported() {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      const context = typeof window === 'undefined' ? 'server' : 'client';
      throw new Error(`Web Crypto API unavailable (context: ${context})`);
    }
  }

  async generateKey(): Promise<string> {
    const key = await crypto.subtle.generateKey(
      CryptoConfig.ALGORITHM,
      true,
      ["encrypt", "decrypt"]
    );
    const exported = await crypto.subtle.exportKey("raw", key);
    return this.arrayBufferToBase64Url(exported);
  }

  async importKey(keyString: string): Promise<CryptoKey> {
    const keyData = this.base64UrlToArrayBuffer(keyString);
    return crypto.subtle.importKey(
      "raw",
      keyData,
      CryptoConfig.ALGORITHM,
      true,
      ["encrypt", "decrypt"]
    );
  }

  async createEncryptionContext(customKey?: string) {
    let keyString: string;

    if (customKey) {
      if (customKey.length < DROP_PASSWORD_MIN_LENGTH) {
        throw new Error(`Password must be at least ${DROP_PASSWORD_MIN_LENGTH} characters.`);
      }
      // Derive key from password if provided
      const salt = this.generateSalt();
      const derivedKey = await this.deriveKeyFromPassword(customKey, salt);
      const exportedKey = await crypto.subtle.exportKey("raw", derivedKey);
      keyString = `derived:${salt}:${this.arrayBufferToBase64Url(exportedKey)}`;
    } else {
      keyString = await this.generateKey();
    }

    const key = await this.importKeyFromString(keyString);
    const dropIvString = this.generateBaseIv();
    const dropIv = new Uint8Array(this.base64UrlToArrayBuffer(dropIvString));

    return { key, keyString, dropIv, dropIvString };
  }

  async restoreEncryptionContext(keyString: string, dropIvString: string) {
    const key = await this.importKeyFromString(keyString);
    const dropIv = new Uint8Array(this.base64UrlToArrayBuffer(dropIvString));
    return { key, keyString, dropIv, dropIvString };
  }

  private async importKeyFromString(keyString: string): Promise<CryptoKey> {
    if (keyString.startsWith("derived:")) {
      const parts = keyString.split(":");
      if (parts.length !== 3 || !parts[2]) {
        throw new Error("Invalid derived key format");
      }
      return this.importKey(parts[2]);
    }
    return this.importKey(keyString);
  }

  async encryptChunk(
    chunk: ArrayBuffer,
    key: CryptoKey,
    baseIv: Uint8Array,
    chunkIndex: number
  ): Promise<ArrayBuffer> {
    const iv = this.generateChunkIv(baseIv, chunkIndex);
    return crypto.subtle.encrypt(
      { name: "AES-GCM", iv: this.getView(iv) },
      key,
      chunk
    );
  }

  async decryptChunk(
    encryptedChunk: ArrayBuffer,
    key: CryptoKey,
    baseIv: Uint8Array,
    chunkIndex: number
  ): Promise<ArrayBuffer> {
    const iv = this.generateChunkIv(baseIv, chunkIndex);
    return crypto.subtle.decrypt(
      { name: "AES-GCM", iv: this.getView(iv) },
      key,
      encryptedChunk
    );
  }

  async encryptFilename(filename: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
    const encoder = new TextEncoder();
    const filenameBuffer = encoder.encode(filename);

    // Reserved chunk index 0xFFFFFFFF for filenames to prevent collision with data chunks
    const filenameIv = this.generateChunkIv(iv, 0xFFFFFFFF);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: this.getView(filenameIv) },
      key,
      filenameBuffer
    );

    return this.arrayBufferToBase64Url(encrypted);
  }

  async decryptFilename(encryptedFilename: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
    const encrypted = this.base64UrlToArrayBuffer(encryptedFilename);
    const filenameIv = this.generateChunkIv(iv, 0xFFFFFFFF);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: this.getView(filenameIv) },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }

  generateSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(CryptoConfig.SALT_LENGTH));
    return this.arrayBufferToBase64Url(salt);
  }

  async deriveKeyFromPassword(password: string, salt: string): Promise<CryptoKey> {
    const saltBytes = new Uint8Array(this.base64UrlToArrayBuffer(salt));

    const hash = await argon2id({
      password,
      salt: saltBytes,
      memorySize: ARGON2_MEMORY,
      iterations: ARGON2_TIME,
      parallelism: ARGON2_PARALLELISM,
      hashLength: ARGON2_HASH_LENGTH,
      outputType: "binary",
    });

    const keyBytes = new Uint8Array(hash);

    return crypto.subtle.importKey(
      "raw",
      keyBytes,
      CryptoConfig.ALGORITHM,
      true,
      ["encrypt", "decrypt"]
    );
  }

  async encryptKeyWithPassword(keyString: string, password: string): Promise<{ encryptedKey: string; iv: string; salt: string }> {
    const salt = this.generateSalt();
    const wrappingKey = await this.deriveKeyFromPassword(password, salt);
    const iv = this.generateBaseIv();
    const ivBuffer = new Uint8Array(this.base64UrlToArrayBuffer(iv));

    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyString);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivBuffer },
      wrappingKey,
      keyData
    );

    return {
      encryptedKey: this.arrayBufferToBase64Url(encrypted),
      iv,
      salt
    };
  }

  async decryptKeyWithPassword(encryptedKey: string, password: string, salt: string, iv: string): Promise<string> {
    const wrappingKey = await this.deriveKeyFromPassword(password, salt);
    const ivBuffer = new Uint8Array(this.base64UrlToArrayBuffer(iv));
    const encryptedData = this.base64UrlToArrayBuffer(encryptedKey);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      wrappingKey,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  createDecryptionStream(
    key: CryptoKey,
    baseIv: Uint8Array,
    chunkSize: number
  ): TransformStream<Uint8Array, Uint8Array> {
    const encryptedChunkSize = chunkSize + AUTH_TAG_SIZE;
    let chunkIndex = 0;
    let buffer = new Uint8Array(0);
    const decryptChunk = this.decryptChunk.bind(this);
    const getView = this.getView.bind(this);

    return new TransformStream({
      async transform(chunk, controller) {
        const newBuffer = new Uint8Array(buffer.length + chunk.length);
        newBuffer.set(buffer);
        newBuffer.set(chunk, buffer.length);
        buffer = newBuffer;

        while (buffer.length >= encryptedChunkSize) {
          const chunkData = buffer.slice(0, encryptedChunkSize);
          buffer = buffer.slice(encryptedChunkSize);

          const decrypted = await decryptChunk(
            getView(chunkData),
            key,
            baseIv,
            chunkIndex
          );

          controller.enqueue(new Uint8Array(decrypted));
          chunkIndex++;
        }
      },

      async flush(controller) {
        if (buffer.length > 0) {
          try {
            const decrypted = await decryptChunk(
              getView(buffer),
              key,
              baseIv,
              chunkIndex
            );
            controller.enqueue(new Uint8Array(decrypted));
          } catch (error) {
            controller.error(error);
          }
        }
      }
    });
  }

  private generateChunkIv(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
    const iv = new Uint8Array(CryptoConfig.IV_LENGTH);
    iv.set(baseIv.slice(0, 8));

    const view = new DataView(iv.buffer);
    view.setUint32(8, chunkIndex, false); // Big-endian
    return iv;
  }

  /**
   * Generate a random base IV for use with chunk encryption.
   * IMPORTANT: Call this once per file to avoid IV reuse across files.
   */
  generateFileIv(): string {
    const iv = crypto.getRandomValues(new Uint8Array(CryptoConfig.IV_LENGTH));
    return this.arrayBufferToBase64Url(iv);
  }

  private generateBaseIv(): string {
    return this.generateFileIv();
  }

  private getView(arr: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (arr instanceof ArrayBuffer) return arr;
    return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
  }

  arrayBufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
          binary += String.fromCharCode(byte);
      }
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async hashFileForResume(file: File): Promise<string> {
    try {
      const sampleSize = Math.min(1024 * 1024, file.size);
      const sample = await file.slice(0, sampleSize).arrayBuffer();

      const encoder = new TextEncoder();
      const metadata = encoder.encode(`${file.name}:${file.size}:${file.lastModified}`);

      const combined = new Uint8Array(sample.byteLength + metadata.byteLength);
      combined.set(new Uint8Array(sample), 0);
      combined.set(metadata, sample.byteLength);

      const hash = await crypto.subtle.digest("SHA-256", combined);
      return this.arrayBufferToBase64Url(hash);
    } catch {
      // Fallback for environments where crypto.subtle.digest might fail or be unavailable
      const fallbackStr = `${file.name}:${file.size}:${file.lastModified}`;
      return btoa(fallbackStr).replace(/[+/=]/g, (c) =>
        c === '+' ? '-' : c === '/' ? '_' : ''
      );
    }
  }
}

// Export a singleton instance for standard usage
export const cryptoService = new FileEncryptionService();
