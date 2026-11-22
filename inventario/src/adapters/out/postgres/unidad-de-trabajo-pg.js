import { Stock } from '../../../domain/stock.js';
import { Reserva } from '../../../domain/reserva.js';

const stockDe = (r) => new Stock({ productoId: r.producto_id, stockFisico: r.stock_fisico, stockReservado: r.stock_reservado, stockMinimo: r.stock_minimo, version: r.version, productoActivo: r.producto_activo });
const reservaDe = (r) => new Reserva({ id: r.id, pedidoId: r.pedido_id, productoId: r.producto_id, cantidad: r.cantidad, estado: r.estado, venceEn: r.vence_en });

/** Repositorios enlazados a UNA conexión/transacción. */
function repos(c) {
  return {
    stocks: {
      /** ADR-007: bloqueo pesimista de filas, SIEMPRE en orden por producto_id (evita deadlocks). */
      async bloquear(ids) {
        const { rows } = await c.query('SELECT * FROM stock WHERE producto_id = ANY($1::uuid[]) ORDER BY producto_id FOR UPDATE', [ids]);
        return new Map(rows.map((r) => [r.producto_id, stockDe(r)]));
      },
      async crear(s) {
        await c.query('INSERT INTO stock (producto_id, stock_fisico, stock_reservado, stock_minimo, version, producto_activo) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
          [s.productoId, s.stockFisico, s.stockReservado, s.stockMinimo, s.version, s.productoActivo]);
      },
      async guardar(s) {
        await c.query('UPDATE stock SET stock_fisico=$2, stock_reservado=$3, stock_minimo=$4, version=$5, producto_activo=$6 WHERE producto_id=$1',
          [s.productoId, s.stockFisico, s.stockReservado, s.stockMinimo, s.version, s.productoActivo]);
      },
    },
    reservas: {
      async crear(lista) {
        for (const r of lista) {
          await c.query('INSERT INTO reservas (id, pedido_id, producto_id, cantidad, estado, vence_en) VALUES ($1,$2,$3,$4,$5,$6)',
            [r.id, r.pedidoId, r.productoId, r.cantidad, r.estado, r.venceEn]);
        }
      },
      async bloquearPorPedido(pedidoId) {
        const { rows } = await c.query('SELECT * FROM reservas WHERE pedido_id=$1 ORDER BY producto_id, id FOR UPDATE', [pedidoId]);
        return rows.map(reservaDe);
      },
      async actualizarEstado(ids, estado) { await c.query('UPDATE reservas SET estado=$2 WHERE id = ANY($1::uuid[])', [ids, estado]); },
      /** Usa idx_reservas_vence_activas; SKIP LOCKED permite varios workers sin pisarse (ADR-015). */
      async bloquearVencidasActivas(ahora, limite) {
        const { rows } = await c.query("SELECT * FROM reservas WHERE estado='ACTIVA' AND vence_en <= $1 ORDER BY vence_en LIMIT $2 FOR UPDATE SKIP LOCKED", [ahora, limite]);
        return rows.map(reservaDe);
      },
    },
    movimientos: {
      async registrar(m) {
        await c.query('INSERT INTO movimientos_inventario (id, producto_id, pedido_id, tipo, cantidad, motivo, usuario_id, fecha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [m.id, m.productoId, m.pedidoId, m.tipo, m.cantidad, m.motivo, m.usuarioId, m.fecha]);
      },
    },
    idempotencia: {
      async obtener(clave, desde) {
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [clave]); // serializa reintentos concurrentes con la misma clave
        const { rows } = await c.query('SELECT * FROM idempotencia WHERE clave=$1 AND creada_en > $2', [clave, desde]);
        return rows[0] ? { clave, operacion: rows[0].operacion, payloadHash: rows[0].payload_hash, resultado: rows[0].resultado } : null;
      },
      async guardar(r) {
        await c.query(`INSERT INTO idempotencia (clave, operacion, payload_hash, resultado, creada_en) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (clave) DO UPDATE SET operacion=EXCLUDED.operacion, payload_hash=EXCLUDED.payload_hash, resultado=EXCLUDED.resultado, creada_en=EXCLUDED.creada_en`,
          [r.clave, r.operacion, r.payloadHash, JSON.stringify(r.resultado), r.creadaEn]);
      },
      async purgar(antesDe) { await c.query('DELETE FROM idempotencia WHERE creada_en < $1', [antesDe]); },
    },
    outbox: {
      async encolar(e) {
        await c.query('INSERT INTO outbox (event_id, event_type, aggregate_id, version, occurred_at, payload) VALUES ($1,$2,$3,$4,$5,$6)',
          [e.eventId, e.eventType, e.aggregateId, e.version, e.occurredAt, JSON.stringify(e.payload)]);
      },
    },
  };
}

/** Puerto UnidadDeTrabajo: una transacción por caso de uso; rollback ante cualquier error. */
export class UnidadDeTrabajoPg {
  constructor(pool) { this.pool = pool; }
  async ejecutar(fn) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(repos(c));
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { c.release(); }
  }
}
