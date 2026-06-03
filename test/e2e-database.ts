import { execSync } from 'node:child_process';

const BLOCKED_DATABASE_URL_PATTERNS = [
  'supabase.co',
  'supabase.com',
  'pooler.supabase',
] as const;

const ALLOWED_DATABASE_URL_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '@postgres:',
  'nestjs_api_starter_test',
  'nestjs_api_starter?',
] as const;

export function assertSafeE2eDatabaseUrl(): void {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for e2e tests. Use a local or CI test database from .env.example.',
    );
  }

  const normalized = databaseUrl.toLowerCase();

  if (
    BLOCKED_DATABASE_URL_PATTERNS.some((pattern) =>
      normalized.includes(pattern),
    )
  ) {
    throw new Error(
      `Refusing to run e2e tests against remote/production database URL: ${databaseUrl}`,
    );
  }

  if (
    !ALLOWED_DATABASE_URL_PATTERNS.some((pattern) =>
      databaseUrl.includes(pattern),
    )
  ) {
    throw new Error(
      `E2E DATABASE_URL must point to a local or CI test Postgres instance: ${databaseUrl}`,
    );
  }
}

export function prepareE2eDatabase(): void {
  assertSafeE2eDatabaseUrl();

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
  execSync('npm run prisma:seed', {
    stdio: 'inherit',
    env: process.env,
  });
}
