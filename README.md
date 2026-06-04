# NestJS API Boilerplate

Reusable NestJS API starter with JWT auth, full RBAC, PostgreSQL, Prisma, Swagger, Docker, idempotency, structured logging, health checks, pagination helpers, testing, and GitHub Actions.

    Client
      |
    NestJS API
      |
    +----------------------+
    | Auth                 |
    | RBAC                 |
    | Idempotency          |
    | Validation           |
    +----------------------+
      |
    Prisma
      |
    PostgreSQL

## Features

- JWT access tokens and refresh token rotation
- Users, roles, and permissions (many-to-many RBAC)
- PostgreSQL + Prisma 7
- Swagger docs at `/docs`
- Request validation and RFC7807-style problem details
- Global rate limiting (`@nestjs/throttler`)
- Structured logging (`nestjs-pino`)
- Health checks (`/health/live`, `/health/ready`)
- Idempotency keys with pluggable storage
- Pagination helpers
- Docker Compose for local development
- GitHub Actions CI

## API Documentation

Interactive OpenAPI documentation is available at `/docs`.

![Swagger UI](./assets/swagger-ui.png)

## Local setup

1. Install Node from `.nvmrc`:

```bash
nvm use
npm install
```

2. Copy the environment template and point it at a **local** database only:

```bash
cp .env.example .env
```

Do not point `.env` at a production or shared Supabase database when running migrations, seeds, or tests.

3. Start PostgreSQL locally:

```bash
docker compose up -d postgres
```

4. Generate the Prisma client, apply migrations, and seed:

```bash
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
```

5. Start the API:

```bash
npm run start:dev
```

Swagger: [http://localhost:3000/docs](http://localhost:3000/docs)

## Environment variables

See `.env.example` for the full list. Required values:

- `DATABASE_URL` — local PostgreSQL connection string
- `JWT_ACCESS_SECRET` — at least 32 characters
- `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`
- `THROTTLE_TTL`, `THROTTLE_LIMIT`
- `IDEMPOTENCY_TTL_SECONDS`
- `SEED_ADMIN_*` — used by `prisma/seed.ts`

## Auth flow

- `POST /auth/register` — create a user (default `user` role) and receive tokens
- `POST /auth/login` — verify credentials and receive tokens
- `POST /auth/refresh` — rotate refresh token and receive a new token pair
- `POST /auth/logout` — revoke the presented refresh token
- `GET /auth/me` — current user with active roles and permissions

Access tokens are short-lived JWTs. Refresh tokens are opaque high-entropy strings stored server-side as SHA-256 digests for indexed lookup.

## RBAC model

- Users have many roles; roles have many permissions
- Roles and permissions both support `isActive`
- Guards load active roles/permissions from the database on each request
- Admin management endpoints require the `admin` role plus explicit permissions such as `users:read`

### Permission naming convention

Use lowercase `resource:action`, colon-separated:

- `users:read`
- `users:write`
- `roles:read`
- `permissions:write`

Seeded permissions must match `^[a-z0-9-]+:[a-z0-9-]+$`.

## Idempotency

Routes opt in with `@RequireIdempotency()`. Clients must send an `Idempotency-Key` header.

Behavior:

- The interceptor atomically **reserves** the key before running the handler
- Completed requests with the same key and request fingerprint replay the stored response
- Concurrent duplicates return `409` while a reservation is in progress
- Reusing a key with a different request body returns `409`
- Failed requests release the pending reservation so a retry can run again

Anonymous requests are scoped by IP (`anonymous:<ip>`); authenticated requests use `user:<userId>`.

## Recommended production upgrades

### Refresh token storage

Auth logic depends on a `TokenStorageService` interface. The default Prisma/Postgres implementation uses indexed SHA-256 digests of opaque refresh tokens. For very high refresh volume, swap in a Redis-backed implementation without changing auth service code.

### Idempotency storage

Idempotency uses a `IdempotencyStore` interface with atomic `reserve` / `complete` / `release`. The default Prisma implementation uses the unique constraint as the atomic gate. Redis (`SET key val NX EX ttl`) is the recommended high-throughput upgrade and provides native TTL cleanup.

## Docker

Start PostgreSQL only:

```bash
docker compose up -d postgres
```

Build and run the API container:

```bash
docker compose up --build api
```

Apply migrations and seed against the Compose database before first run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nestjs_api_starter?schema=public npm run prisma:deploy
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nestjs_api_starter?schema=public npm run prisma:seed
```

## Testing

Unit tests:

```bash
npm test
```

End-to-end tests require a disposable **local or CI test** PostgreSQL database. E2E setup refuses Supabase/production-looking URLs:

```bash
cp .env.example .env
docker compose up -d postgres
npm run prisma:deploy
npm run prisma:seed
npm run test:e2e
```

Other commands:

```bash
npm run lint
npm run typecheck
npm run build
```

## CI

GitHub Actions runs install, Prisma generate, migrate deploy against a disposable Postgres service, lint, typecheck, unit tests, e2e tests, and build.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | Start in watch mode |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:deploy` | Apply migrations |
| `npm run prisma:seed` | Seed roles, permissions, admin user |
| `npm run test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run build` | Production build |
