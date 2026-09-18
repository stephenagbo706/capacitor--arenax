import { Pool } from 'pg';

export function createPool() {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for the ArenaX backend.');
  }

  return new Pool({
    connectionString,
    ssl: process.env['PGSSL'] === 'true' ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env['PG_POOL_SIZE'] || 10),
  });
}

export type DbPool = ReturnType<typeof createPool>;
