import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createDatabase(connectionString) {
  return new Pool({ connectionString, max: Number(process.env.TEAM_DATABASE_POOL_SIZE || 32), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

export async function initializeDatabase(pool) {
  const schema = await fs.readFile(path.join(moduleDirectory, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);
}

export async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await operation(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
