/**
 * Application-wide constants
 */

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** Maximum sizes for preview */
export const MAX_IMAGE_PREVIEW_SIZE = 50 * MB;
export const MAX_VIDEO_PREVIEW_SIZE = 100 * MB;
export const MAX_AUDIO_PREVIEW_SIZE = 50 * MB;
export const MAX_TEXT_PREVIEW_SIZE = 1 * MB;
export const MAX_ZIP_SIZE = 500 * MB;

/** Maximum multipart parts per file (the S3/R2 protocol limit). */
export const MAX_CHUNKS_PER_FILE = 10_000;

/** Target plaintext chunk size for multipart encryption and upload (50 MiB). */
export const MIN_CHUNK_SIZE = 50 * MB;

/** S3/R2 requires every non-final multipart part to be at least 5 MiB. */
export const MIN_MULTIPART_PART_SIZE = 5 * MB;

/** AES-GCM authentication tag size in bytes. */
export const AUTH_TAG_SIZE = 16;

/** Largest advertised plaintext file size. Ciphertext adds one auth tag/part. */
export const MAX_DROP_PLAINTEXT_FILE_SIZE = 250 * GB;
export const MAX_DROP_ENCRYPTED_FILE_SIZE =
  MAX_DROP_PLAINTEXT_FILE_SIZE + MAX_CHUNKS_PER_FILE * AUTH_TAG_SIZE;

/** File size threshold: 1 GB */
export const FILE_SIZE_THRESHOLD_1GB = 1 * GB;

/** Minimum password length for custom-password-protected drops */
export const DROP_PASSWORD_MIN_LENGTH = 12;

/** Argon2id parameters for password key derivation (OWASP recommended) */
export const ARGON2_MEMORY = 65536;    // 64 MiB
export const ARGON2_TIME = 3;          // iterations
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LENGTH = 32;  // bytes (AES-256 key)

/** 1 day in milliseconds */
export const DAY_MS = 86_400_000;

/** Days of grace period after subscription expires */
export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;

/** Days after downgrade before excess resources are scheduled for removal */
export const DOWNGRADE_SCHEDULING_DELAY_DAYS = 7;

/** Days after scheduling before excess resources are deleted */
export const DOWNGRADE_DELETION_DELAY_DAYS = 7;

/** Minimum days between two abandoned-checkout recovery emails to the same user */
export const CHECKOUT_RECOVERY_THROTTLE_DAYS = 7;
