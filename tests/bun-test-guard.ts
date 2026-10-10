// Preloaded by bunfig.toml for bare `bun test` only. This suite runs on Vitest
// (vi.mock hoisting, jsdom projects, vitest.setup.ts); Bun's built-in runner
// cannot execute it faithfully, so fail fast with a pointer instead of a wall
// of misleading failures. `bun run test` invokes Vitest and never loads this.
console.error(
    "\n[anon.li] Tests run on Vitest, not Bun's built-in test runner.\n" +
    "  Use:  bun run test              # full suite\n" +
    "        bun run test <pattern>    # matching files\n" +
    "        bun run test -t \"<name>\"  # single test by name\n",
)
process.exit(1)
