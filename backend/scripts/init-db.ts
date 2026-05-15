import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase, pool } from '../src/db.js';
import { verifySeedData } from '../src/repository.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(scriptDir, '../../supabase/schema.sql');

async function main(): Promise<void> {
  await pool.query('drop schema if exists public cascade');
  await pool.query('create schema public');

  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  await pool.query(schemaSql);
  const summary = await verifySeedData(pool);

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
