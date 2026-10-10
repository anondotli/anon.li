/**
 * Org shared-E2EE API error codes the CLIENT branches on. Mirrors the same
 * entries in `ErrorCodes` (lib/api-response.ts), which is server-only and must
 * not be pulled into client bundles; tests/vault-error-codes.test.ts keeps the
 * two in sync.
 */

/** 409: a rotation's prepared data no longer matches the server — re-prepare and retry. */
export const ROTATION_DATA_CHANGED_CODE = "ROTATION_DATA_CHANGED"

/** 409: a write was encrypted with a stale org vault key generation — refresh the key and retry. */
export const ORG_KEY_GENERATION_MISMATCH_CODE = "ORG_KEY_GENERATION_MISMATCH"

/** 409: refusing to release the only remaining current-generation grant of an org vault key. */
export const ORG_KEY_LAST_HOLDER_CODE = "ORG_KEY_LAST_HOLDER"
