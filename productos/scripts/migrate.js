// npm run migrate  -> aplica migrations/*.sql (versionadas en schema_migrations)
import pg from 'pg';
import { migrar } from '../src/infrastructure/postgres/migrar.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/db_core' });
await migrar(pool, { info: (o, m) => console.log(m, o) });
await pool.end();
