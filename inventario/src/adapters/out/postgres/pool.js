import pg from 'pg';
// NUMERIC llega como string; se convierte en el mapper. BIGINT (outbox.id) se deja como string.
export const crearPool = (url) => new pg.Pool({ connectionString: url, max: 20 });
export async function conTransaccion(pool, fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
