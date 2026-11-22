// npm run seed  -> migra y ejecuta seeds/*.sql (idempotente)
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrar } from '../src/infrastructure/postgres/migrar.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/db_core' });
await migrar(pool, { info: () => {} });
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../seeds');
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) {
  await pool.query(await readFile(path.join(dir, f), 'utf8'));
  console.log('seed aplicado:', f);
}
await pool.end();
