import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

/** Ejecuta las migraciones versionadas (DMD-M1-P1) bajo un advisory lock para que varias instancias no choquen. */
export async function migrar(pool, log) {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727001)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())');
    const hechas = new Set((await c.query('SELECT nombre FROM schema_migrations')).rows.map((r) => r.nombre));
    for (const f of (await readdir(DIR)).filter((x) => x.endsWith('.sql')).sort()) {
      if (hechas.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(await readFile(path.join(DIR, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations(nombre) VALUES ($1)', [f]);
        await c.query('COMMIT');
        log.info({ migracion: f }, 'migración aplicada');
      } catch (e) { await c.query('ROLLBACK'); throw e; }
    }
  } finally { await c.query('SELECT pg_advisory_unlock(727001)').catch(() => {}); c.release(); }
}
