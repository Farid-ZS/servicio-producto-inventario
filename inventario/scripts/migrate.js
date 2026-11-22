// npm run migrate  -> aplica migrations/*.sql (versionadas en schema_migrations)
import pg from 'pg';
import { migrar } from '../src/adapters/out/postgres/migrar.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/db_operaciones' });
await migrar(pool, { info: (o, m) => console.log(m, o) });
await pool.end();
