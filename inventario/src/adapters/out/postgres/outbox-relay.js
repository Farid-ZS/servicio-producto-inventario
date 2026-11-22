/**
 * Relay de la Transactional Outbox (ADR-024): publica eventos pendientes a RabbitMQ y los marca como publicados.
 * Entrega al-menos-una-vez; los consumidores son idempotentes. SKIP LOCKED permite varias instancias.
 */
export class OutboxRelay {
  constructor({ pool, publicador, log, intervaloMs = 1000, lote = 50 }) { Object.assign(this, { pool, publicador, log, intervaloMs, lote }); }

  iniciar() {
    const ciclo = async () => {
      try { while ((await this.procesarLote()) === this.lote) { /* drenar */ } }
      catch (error) { this.log.error({ error }, 'fallo del relay de Outbox; se reintentará'); }
      this.timer = setTimeout(ciclo, this.intervaloMs);
    };
    this.timer = setTimeout(ciclo, 0);
  }
  detener() { clearTimeout(this.timer); }

  async procesarLote() {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `SELECT id, event_id, event_type, aggregate_id, version, occurred_at, payload FROM outbox
         WHERE published_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [this.lote]);
      for (const r of rows) {
        await this.publicador.publicar({
          eventId: r.event_id, eventType: r.event_type, occurredAt: r.occurred_at.toISOString(),
          aggregateId: r.aggregate_id, version: r.version, payload: r.payload,
        });
        await c.query('UPDATE outbox SET published_at = now() WHERE id = $1', [r.id]);
      }
      await c.query('COMMIT');
      return rows.length;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
  }
}
