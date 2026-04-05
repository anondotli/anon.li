// IMPORTANT: client-only - do not import in server components

import { cryptoService } from "./crypto.client"

const KEY_STORE_PREFIX = "anon_key_"
const PREFERENCES_KEY = "anon_drop_key_preferences"

const STORAGE_VERSION = 2
const DROP_KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface DropKeyStoragePreferences {
  rememberDropKeys: boolean
}

export interface StoredDropKeyInfo {
  dropId: string
  savedAt: number
  expiresAt: number
}

export interface LocalDevicePrivacySnapshot {
  preferences: DropKeyStoragePreferences
  storedKeys: StoredDropKeyInfo[]
}

interface StoredDropKeyRecord {
  version: typeof STORAGE_VERSION
  kind: "drop_key"
  key: string
  savedAt: number
  expiresAt: number
}

interface LegacyStoredKey {
  key: string
  timestamp?: number
}

const DEFAULT_PREFERENCES: DropKeyStoragePreferences = {
  rememberDropKeys: true,
}

function getLocalStorage(): Storage {
  return window.localStorage
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function isDropKeyRecord(value: unknown): value is StoredDropKeyRecord {
  return !!value
    && typeof value === "object"
    && (value as StoredDropKeyRecord).version === STORAGE_VERSION
    && (value as StoredDropKeyRecord).kind === "drop_key"
    && typeof (value as StoredDropKeyRecord).key === "string"
    && typeof (value as StoredDropKeyRecord).savedAt === "number"
    && typeof (value as StoredDropKeyRecord).expiresAt === "number"
}

async function getLegacyStorageKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = encoder.encode("anon-secure-storage-v1")
  const hash = await crypto.subtle.digest("SHA-256", keyMaterial)

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  )
}

async function decryptLegacyRecord(encrypted: string): Promise<unknown> {
  try {
    const key = await getLegacyStorageKey()
    const combined = new Uint8Array(cryptoService.base64UrlToArrayBuffer(encrypted))

    if (combined.length < 13) return null

    const iv = combined.slice(0, 12)
    const data = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    )

    const decoder = new TextDecoder()
    return JSON.parse(decoder.decode(decrypted))
  } catch {
    return null
  }
}

function removeStorageItem(key: string) {
  getLocalStorage().removeItem(key)
}

function getStoredItem(key: string): string | null {
  return getLocalStorage().getItem(key)
}

function setStoredItem(key: string, value: string) {
  getLocalStorage().setItem(key, value)
}

function getDropKeyStorageKey(dropId: string) {
  return `${KEY_STORE_PREFIX}${dropId}`
}

export function getDropKeyStoragePreferences(): DropKeyStoragePreferences {
  const stored = getStoredItem(PREFERENCES_KEY)
  if (!stored) return DEFAULT_PREFERENCES

  const parsed = parseJson<Partial<DropKeyStoragePreferences>>(stored)
  if (!parsed) return DEFAULT_PREFERENCES

  return {
    rememberDropKeys: parsed.rememberDropKeys ?? DEFAULT_PREFERENCES.rememberDropKeys,
  }
}

export function setDropKeyStoragePreferences(preferences: Partial<DropKeyStoragePreferences>): DropKeyStoragePreferences {
  const nextPreferences = {
    ...getDropKeyStoragePreferences(),
    ...preferences,
  }

  setStoredItem(PREFERENCES_KEY, JSON.stringify(nextPreferences))
  return nextPreferences
}

export async function storeEncryptionKey(dropId: string, keyString: string, ttlMs = DROP_KEY_TTL_MS): Promise<void> {
  const preferences = getDropKeyStoragePreferences()

  if (!preferences.rememberDropKeys) {
    removeStoredEncryptionKey(dropId)
    return
  }

  const now = Date.now()
  const record: StoredDropKeyRecord = {
    version: STORAGE_VERSION,
    kind: "drop_key",
    key: keyString,
    savedAt: now,
    expiresAt: now + ttlMs,
  }

  setStoredItem(getDropKeyStorageKey(dropId), JSON.stringify(record))
}

export async function getStoredEncryptionKey(dropId: string): Promise<string | null> {
  const storageKey = getDropKeyStorageKey(dropId)
  const raw = getStoredItem(storageKey)

  if (!raw) return null

  const parsed = parseJson<unknown>(raw)
  if (isDropKeyRecord(parsed)) {
    if (parsed.expiresAt < Date.now()) {
      removeStorageItem(storageKey)
      return null
    }

    return parsed.key
  }

  const legacy = await decryptLegacyRecord(raw)
  if (!legacy || typeof legacy !== "object" || !("key" in legacy)) {
    removeStorageItem(storageKey)
    return null
  }

  const keyRecord = legacy as LegacyStoredKey
  if (typeof keyRecord.key !== "string" || !keyRecord.key) {
    removeStorageItem(storageKey)
    return null
  }

  const savedAt = keyRecord.timestamp ?? Date.now()
  const expiresAt = savedAt + DROP_KEY_TTL_MS
  if (expiresAt < Date.now()) {
    removeStorageItem(storageKey)
    return null
  }

  const migratedRecord: StoredDropKeyRecord = {
    version: STORAGE_VERSION,
    kind: "drop_key",
    key: keyRecord.key,
    savedAt,
    expiresAt,
  }

  setStoredItem(storageKey, JSON.stringify(migratedRecord))
  return migratedRecord.key
}

async function listStoredEncryptionKeys(): Promise<StoredDropKeyInfo[]> {
  const storage = getLocalStorage()
  const entries: StoredDropKeyInfo[] = []

  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(KEY_STORE_PREFIX)) continue

    const dropId = key.slice(KEY_STORE_PREFIX.length)
    const keyString = await getStoredEncryptionKey(dropId)
    if (!keyString) continue

    const raw = getStoredItem(key)
    const parsed = raw ? parseJson<unknown>(raw) : null
    if (isDropKeyRecord(parsed)) {
      entries.push({
        dropId,
        savedAt: parsed.savedAt,
        expiresAt: parsed.expiresAt,
      })
    }
  }

  return entries.sort((left, right) => right.savedAt - left.savedAt)
}

export function removeStoredEncryptionKey(dropId: string): void {
  removeStorageItem(getDropKeyStorageKey(dropId))
}

export async function clearAllStoredEncryptionKeys(): Promise<void> {
  const storage = getLocalStorage()
  const keysToRemove: string[] = []

  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key?.startsWith(KEY_STORE_PREFIX)) {
      keysToRemove.push(key)
    }
  }

  for (const key of keysToRemove) {
    storage.removeItem(key)
  }
}

export async function getLocalDevicePrivacySnapshot(): Promise<LocalDevicePrivacySnapshot> {
  return {
    preferences: getDropKeyStoragePreferences(),
    storedKeys: await listStoredEncryptionKeys(),
  }
}

export const dropKeyRetentionDays = DROP_KEY_TTL_MS / (24 * 60 * 60 * 1000)
