import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Server code is the majority of the suite; a jsdom environment costs
    // ~0.5s per file to create, so only component tests get one (see projects).
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // The suite includes real Argon2id/WebCrypto integration work. Under the
    // full parallel CI load, otherwise-healthy tests can exceed Vitest's 5s
    // default even though focused runs complete normally.
    testTimeout: 15_000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
    ],
    alias: {
      '@': path.resolve(import.meta.dirname, './'),
    },
    // `*.test.ts` runs in node, `*.test.tsx` in jsdom. A `.ts` test that needs
    // browser globals (window, localStorage, DOM-flavoured WebCrypto) opts in
    // with a `// @vitest-environment jsdom` docblock, which overrides both.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
        },
      },
    ],
  },
})
