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

/** Maximum chunks per file (S3 limit is 10,000, we cap at 100 for efficiency) */
export const MAX_CHUNKS_PER_FILE = 100;

/** Minimum chunk size for multi-part uploads (50 MB) */
export const MIN_CHUNK_SIZE = 50 * MB;

/** File size threshold: 1 GB */
export const FILE_SIZE_THRESHOLD_1GB = 1 * GB;

/** Minimum password length for custom-password-protected drops */
export const DROP_PASSWORD_MIN_LENGTH = 12;

/** Argon2id parameters for password key derivation (OWASP recommended) */
export const ARGON2_MEMORY = 65536;    // 64 MiB
export const ARGON2_TIME = 3;          // iterations
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LENGTH = 32;  // bytes (AES-256 key)

/** AES-GCM authentication tag size in bytes */
export const AUTH_TAG_SIZE = 16;

/** 1 day in milliseconds */
export const DAY_MS = 86_400_000;

/** Days of grace period after subscription expires */
export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;

/** Days after downgrade before excess resources are scheduled for removal */
export const DOWNGRADE_SCHEDULING_DELAY_DAYS = 7;

/** Days after scheduling before excess resources are deleted */
export const DOWNGRADE_DELETION_DELAY_DAYS = 7;
