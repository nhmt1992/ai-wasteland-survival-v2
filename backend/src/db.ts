import { Pool, types, type PoolClient } from 'pg';
import { env } from './env.js';

types.setTypeParser(20, (value: string) => Number(value));
types.setTypeParser(1700, (value: string) => Number(value));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export async function withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    const result = await handler(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // ignore rollback errors
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function pingDatabase(): Promise<void> {
  await pool.query('select 1');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
