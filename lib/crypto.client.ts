import {
  MAX_CHUNKS_PER_FILE,
  MIN_CHUNK_SIZE,
  FILE_SIZE_THRESHOLD_1GB,
  ARGON2_MEMORY,
  ARGON2_TIME,
  ARGON2_PARALLELISM,
  ARGON2_HASH_LENGTH,
  AUTH_TAG_SIZE,
} from "@/lib/constants";
import {
  arrayBufferToBase64Url as encodeBase64Url,
  base64UrlToArrayBuffer as decodeBase64Url,
} from "@/lib/crypto/base64url";

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
    if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
      throw new RangeError("File size must be a non-negative safe integer");
    }

    // Small files: single chunk
    if (fileSize <= MIN_CHUNK_SIZE) {
      return { chunkSize: fileSize || 1, chunkCount: 1 };
    }

    // Keep parts at the 50 MiB target instead of spreading a file over a small
    // fixed number of ever-larger chunks. A 250 GiB file is therefore 5,120
    // parts, not 100 multi-gigabyte buffers in the browser.
    let chunkSize = MIN_CHUNK_SIZE;
    let chunkCount = Math.ceil(fileSize / chunkSize);

    // This branch is outside today's 250 GiB product cap, but keeps the helper
    // protocol-safe if that cap grows: increase the part size just enough to
    // remain within S3/R2's 10,000-part ceiling.
    if (chunkCount > MAX_CHUNKS_PER_FILE) {
      chunkSize = Math.ceil(fileSize / MAX_CHUNKS_PER_FILE);
      chunkCount = Math.ceil(fileSize / chunkSize);
    }

    return { chunkSize, chunkCount };
  },

  getConcurrency(fileSize: number): number {
    // Each worker can temporarily retain both a plaintext and encrypted chunk
    // while fetch owns the request body. At the 50 MiB target, two large-file
    // workers bound that working set to roughly 200 MiB plus browser overhead.
    return fileSize < FILE_SIZE_THRESHOLD_1GB ? 3 : 2;
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

  /**
   * Create a fresh encryption context for a new drop: a random 256-bit AES-GCM
   * key plus a random base IV. The key is generated client-side and is only ever
   * placed in the URL fragment — it never reaches the server.
   *
   * This intentionally does NOT derive the key from a password. Password
   * protection is layered on top via encryptKeyWithPassword(), which wraps this
   * random key — keeping the password out of the share URL and the raw key
   * material out of any server-stored field. A previous branch here derived the
   * key from a password and embedded it as a `derived:salt:key` string; it was
   * removed so a derived key can never leak into a share URL. (importKeyFromString
   * still *decodes* that legacy form for backward compatibility.)
   */
  async createEncryptionContext() {
    const keyString = await this.generateKey();

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
    try {
      return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: this.getView(iv) },
        key,
        encryptedChunk
      );
    } catch (error) {
      const legacyIv = this.generateLegacyChunkIv(baseIv, chunkIndex);
      if (this.equalBytes(iv, legacyIv)) throw error;
      return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: this.getView(legacyIv) },
        key,
        encryptedChunk
      );
    }
  }

  private async encryptMetadataValue(
    value: string,
    key: CryptoKey,
    iv: Uint8Array,
    domainIndex: number,
  ): Promise<string> {
    const encoder = new TextEncoder();
    const valueBuffer = encoder.encode(value);

    const metadataIv = this.generateChunkIv(iv, domainIndex);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: this.getView(metadataIv) },
      key,
      valueBuffer
    );

    return this.arrayBufferToBase64Url(encrypted);
  }

  private async decryptMetadataValue(
    encryptedValue: string,
    key: CryptoKey,
    iv: Uint8Array,
    domainIndex: number,
  ): Promise<string> {
    const encrypted = this.base64UrlToArrayBuffer(encryptedValue);
    const metadataIv = this.generateChunkIv(iv, domainIndex);

    let decrypted: ArrayBuffer;
    try {
      decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: this.getView(metadataIv) },
        key,
        encrypted
      );
    } catch (error) {
      const legacyIv = this.generateLegacyChunkIv(iv, domainIndex);
      if (this.equalBytes(metadataIv, legacyIv)) throw error;
      decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: this.getView(legacyIv) },
        key,
        encrypted
      );
    }

    return new TextDecoder().decode(decrypted);
  }

  async encryptFilename(filename: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
    // Reserved domain 0xFFFFFFFF for filenames/titles, distinct from file data
    // chunks (0..MAX_CHUNKS_PER_FILE-1).
    return this.encryptMetadataValue(filename, key, iv, 0xFFFFFFFF);
  }

  async decryptFilename(encryptedFilename: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
    return this.decryptMetadataValue(encryptedFilename, key, iv, 0xFFFFFFFF);
  }

  /**
   * Drop title and message share a base IV. AES-GCM must never reuse a nonce
   * under the same key, so messages use their own reserved domain rather than
   * the filename/title domain above.
   */
  async encryptMessage(message: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
    return this.encryptMetadataValue(message, key, iv, 0xFFFFFFFE);
  }

  async decryptMessage(encryptedMessage: string, key: CryptoKey, iv: Uint8Array): Promise<string> {
    try {
      return await this.decryptMetadataValue(encryptedMessage, key, iv, 0xFFFFFFFE);
    } catch {
      // Older clients encrypted messages with the filename domain. Retain read
      // compatibility while ensuring every newly created drop is nonce-safe.
      return this.decryptFilename(encryptedMessage, key, iv);
    }
  }

  generateSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(CryptoConfig.SALT_LENGTH));
    return this.arrayBufferToBase64Url(salt);
  }

  async deriveKeyFromPassword(password: string, salt: string): Promise<CryptoKey> {
    const saltBytes = new Uint8Array(this.base64UrlToArrayBuffer(salt));

    // Argon2 is only needed for password-protected Drops/Forms. Loading the
    // WASM implementation lazily keeps it out of the initial download and
    // ordinary random-key encryption path.
    const { argon2id } = await import("hash-wasm");
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
    chunkSize: number,
    expected: { encryptedSize: number; chunkCount: number },
  ): TransformStream<Uint8Array, Uint8Array> {
    if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) {
      throw new RangeError("Encrypted chunk size must be a positive safe integer");
    }
    if (!Number.isSafeInteger(expected.encryptedSize) || expected.encryptedSize < AUTH_TAG_SIZE + 1) {
      throw new RangeError("Encrypted file size is invalid");
    }
    if (
      !Number.isSafeInteger(expected.chunkCount)
      || expected.chunkCount < 1
      || expected.chunkCount > MAX_CHUNKS_PER_FILE
    ) {
      throw new RangeError("Encrypted file chunk count is invalid");
    }

    const encryptedChunkSize = chunkSize + AUTH_TAG_SIZE;
    let chunkIndex = 0;
    let receivedEncryptedBytes = 0;
    let buffer = new Uint8Array(0);
    const decryptChunk = this.decryptChunk.bind(this);
    const getView = this.getView.bind(this);

    return new TransformStream({
      async transform(chunk, controller) {
        receivedEncryptedBytes += chunk.byteLength;
        if (receivedEncryptedBytes > expected.encryptedSize) {
          throw new Error("Encrypted file is larger than declared");
        }

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

          if (chunkIndex > expected.chunkCount) {
            throw new Error("Encrypted file contains too many chunks");
          }
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
            chunkIndex++;
          } catch (error) {
            controller.error(error);
            return;
          }
        }

        if (
          receivedEncryptedBytes !== expected.encryptedSize
          || chunkIndex !== expected.chunkCount
        ) {
          controller.error(new Error("Encrypted file is incomplete or malformed"));
        }
      }
    });
  }

  private generateChunkIv(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
    this.validateNonceInput(baseIv, chunkIndex);
    const iv = baseIv.slice();

    const view = new DataView(iv.buffer);
    // Preserve all 96 random bits in the per-file base IV. XORing the final
    // word with the chunk/domain counter is a bijection, so counters remain
    // distinct within a file while independent files retain 96-bit collision
    // resistance. Older clients overwrote this word; decryption falls back to
    // that authenticated legacy format above.
    view.setUint32(8, view.getUint32(8, false) ^ chunkIndex, false);
    return iv;
  }

  private generateLegacyChunkIv(baseIv: Uint8Array, chunkIndex: number): Uint8Array {
    this.validateNonceInput(baseIv, chunkIndex);
    const iv = new Uint8Array(CryptoConfig.IV_LENGTH);
    iv.set(baseIv.slice(0, 8));
    new DataView(iv.buffer).setUint32(8, chunkIndex, false);
    return iv;
  }

  private validateNonceInput(baseIv: Uint8Array, chunkIndex: number): void {
    if (baseIv.byteLength !== CryptoConfig.IV_LENGTH) {
      throw new RangeError("AES-GCM base IV must be 12 bytes");
    }
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 0xFFFFFFFF) {
      throw new RangeError("AES-GCM nonce counter is out of range");
    }
  }

  private equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength
      && left.every((value, index) => value === right[index]);
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
    return encodeBase64Url(buffer);
  }

  base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
    return decodeBase64Url(base64url);
  }

}

// Export a singleton instance for standard usage
export const cryptoService = new FileEncryptionService();
