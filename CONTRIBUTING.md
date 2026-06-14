# Contributing to anon.li

Thank you for your interest in contributing to anon.li! We are building a privacy-first platform for anonymous email and encrypted file sharing.

## Development Setup

We use [Bun](https://bun.sh) for dependency management and task running.

1. **Prerequisites**
   - Bun >= 1.0
   - PostgreSQL
   - Node.js 20+ (for certain tooling compatibility)

2. **Installation**
   ```bash
   git clone https://github.com/anondotli/anon.li.git
   cd anon.li
   bun install
   ```

3. **Environment**
   Copy `.env.example` to `.env` and configure your local Postgres connection string.

4. **Database**
   Initialize the local database:
   ```bash
   bunx prisma generate
   bunx prisma db push
   ```

5. **Start Developing**
   ```bash
   bun dev
   ```
   The app will run at http://localhost:3000.

## Testing

We use Vitest with jsdom. Please ensure tests pass before submitting a PR.

```bash
bun run test
```

## Pull Request Process

1. Fork the repository and create your branch from `main`.
2. Ensure your code follows our strict TypeScript guidelines (no `any`).
3. If modifying the database, include a schema migration: `bunx prisma migrate dev`.
4. Submit the PR!

## License

By contributing, you agree that your contributions will be licensed under its GNU Affero General Public License v3.0.
