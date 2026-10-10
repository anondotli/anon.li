# Drop integrity: truncation and file-omission gap

Status: **known gap, deferred** (tracked here until a versioned format ships).

## What is protected today

Each file is split into chunks, and each chunk is sealed with AES-256-GCM. The nonce for chunk `i` is derived from the file's random base IV and `i` (`generateChunkIv` in `lib/crypto.client.ts`). As a result:

- tampering with any chunk's bytes fails authentication;
- swapping or reordering chunks fails authentication, because each chunk only opens under its own derived nonce;
- splicing chunks between files or drops fails, because those use different base IVs and different keys.

File names, the drop title and the drop message are encrypted with domain-separated nonces (`encryptMetadataValue`).

## What is not protected

Three things come from **unauthenticated server metadata** (`size`, `chunkCount` and the drop's `files[]` list), so the server can change them without detection:

1. **Truncation.** A server, or anything that can rewrite R2 objects, can report `chunkCount = k` with a matching `size` and serve only the first `k` chunks of a longer file. Every served chunk is genuine, so decryption succeeds, and the recipient gets a silently shortened file.
2. **File omission.** The server can drop an entry from `files[]`. Nothing the uploader encrypted commits to how many files the drop contains, or which ones.

Neither attack exposes plaintext or lets the server forge content. Both break integrity of the delivered set.

## Proposed fix (format v2)

The change must be backward-compatible: v1 drops stay downloadable without verification.

- **Per-file commitment.** Encrypt `{ v: 2, path, size, chunkCount }` as the file's encrypted metadata, replacing today's bare encrypted path. On download, refuse the file if the server's `size`/`chunkCount` differ from the decrypted values.
  - Alternative: authenticate a "final chunk" marker by deriving the last chunk's nonce from a distinct domain, or by putting `chunkCount` in its AAD.
- **Drop manifest.** After every file is finalized, the uploader encrypts a manifest of `{ fileId, size, chunkCount }` into the drop's encrypted metadata (a new encrypted field under the same key, with its own nonce domain). Downloaders verify that the file list they received matches the manifest exactly.
- **Version signalling.** Mark v2 explicitly in the encrypted payload. Never infer it from server-supplied flags, or a server could downgrade a v2 drop to v1 to skip verification.
  - If downgrade resistance matters for v1-looking drops, the share link can carry a version hint in the URL fragment, which the server never sees.

## Compatibility work required

- Web uploader and downloader (`hooks/use-drop-upload.ts`, `hooks/use-drop-download.ts`, `lib/crypto.client.ts`).
- Any first- or third-party clients that read encrypted file names (CLI, API integrations, MCP consumers): they must understand the v2 metadata envelope before v2 uploads become the default.
- Tests: truncated `chunkCount`, omitted file, a v1 drop still downloads, and v2 metadata that cannot be downgraded.
