import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // The suite includes real Argon2id/WebCrypto integration work. Under the
    // full parallel CI load, otherwise-healthy tests can exceed Vitest's 5s
    // default even though focused runs complete normally.
    testTimeout: 15_000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
