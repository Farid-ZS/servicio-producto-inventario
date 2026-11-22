import { Producto } from '../../domain/producto.js';
import { DomainError } from '../../domain/errors.js';
import { conTransaccion } from './pool.js';

const mapear = (r) => Producto.desde({
  id: r.id, codigo: r.codigo, nombre: r.nombre, descripcion: r.descripcion,
  precioVenta: Number(r.precio_venta), estado: r.estado, categoriaId: r.categoria_id, version: r.version,
});

const encolar = (c, e) => c.query(
  'INSERT INTO outbox (event_id, event_type, aggregate_id, version, occurred_at, payload) VALUES ($1,$2,$3,$4,$5,$6)',
  [e.eventId, e.eventType, e.aggregateId, e.version, e.occurredAt, JSON.stringify(e.payload)]);

export class RepositorioProductosPg {
  constructor(pool) { this.pool = pool; }

  /** Producto + evento Outbox en una sola transacción. Una colisión del UNIQUE de `codigo` se traduce a CODIGO_DUPLICADO. */
  async crear(p, evento) {
    try {
      await conTransaccion(this.pool, async (c) => {
        await c.query(
          'INSERT INTO productos (id, codigo, nombre, descripcion, precio_venta, estado, categoria_id, version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [p.id, p.codigo, p.nombre, p.descripcion, p.precioVenta, p.estado, p.categoriaId, p.version]);
        if (evento) await encolar(c, evento);
      });
    } catch (e) {
      if (e.code === '23505' && e.constraint === 'productos_codigo_key') throw new DomainError('CODIGO_DUPLICADO', 'Colisión de código');
      throw e;
    }
  }

  async actualizar(p, evento) {
    await conTransaccion(this.pool, async (c) => {
      await c.query('UPDATE productos SET nombre=$2, descripcion=$3, precio_venta=$4, estado=$5, categoria_id=$6, version=$7 WHERE id=$1',
        [p.id, p.nombre, p.descripcion, p.precioVenta, p.estado, p.categoriaId, p.version]);
      if (evento) await encolar(c, evento);
    });
  }

  async porId(id) {
    const { rows } = await this.pool.query('SELECT * FROM productos WHERE id=$1', [id]);
    return rows[0] ? mapear(rows[0]) : null;
  }

  /** ADR-017: filtros combinables, índices (código UNIQUE, categoría/estado, GIN trigram) y paginación obligatoria. */
  async buscar({ texto, categoriaId, estado, page, size }) {
    const w = []; const v = [];
    if (texto) { v.push(`%${texto.replace(/[\\%_]/g, '\\$&')}%`); w.push(`(codigo ILIKE $${v.length} OR nombre ILIKE $${v.length})`); }
    if (categoriaId) { v.push(categoriaId); w.push(`categoria_id = $${v.length}`); }
    if (estado) { v.push(estado); w.push(`estado = $${v.length}`); }
    v.push(size, (page - 1) * size);
    const { rows } = await this.pool.query(
      `SELECT *, count(*) OVER() AS total FROM productos ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
       ORDER BY nombre, id LIMIT $${v.length - 1} OFFSET $${v.length}`, v);
    return { items: rows.map(mapear), total: rows.length ? Number(rows[0].total) : 0 };
  }

  async listarActivosPorCategorias(ids, limite = 50) {
    const { rows } = await this.pool.query(
      "SELECT * FROM productos WHERE categoria_id = ANY($1::uuid[]) AND estado='ACTIVO' ORDER BY codigo LIMIT $2", [ids, limite]);
    return rows.map(mapear);
  }
}
