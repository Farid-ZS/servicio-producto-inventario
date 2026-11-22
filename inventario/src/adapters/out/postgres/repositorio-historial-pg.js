export class RepositorioHistorialPg {
  constructor(pool) { this.pool = pool; }
  /** Usa idx_movimientos_producto_tipo_fecha (producto, tipo, fecha). */
  async consultar({ productoId, tipo, desde, hasta, page, size }) {
    const w = ['producto_id = $1']; const v = [productoId];
    if (tipo) { v.push(tipo); w.push(`tipo = $${v.length}`); }
    if (desde) { v.push(desde); w.push(`fecha >= $${v.length}`); }
    if (hasta) { v.push(hasta); w.push(`fecha <= $${v.length}`); }
    v.push(size, (page - 1) * size);
    const { rows } = await this.pool.query(
      `SELECT *, count(*) OVER() AS total FROM movimientos_inventario WHERE ${w.join(' AND ')} ORDER BY fecha DESC, id LIMIT $${v.length - 1} OFFSET $${v.length}`, v);
    return {
      page, size, total: rows.length ? Number(rows[0].total) : 0,
      items: rows.map((r) => ({ movementId: r.id, productId: r.producto_id, orderId: r.pedido_id, type: r.tipo, quantity: r.cantidad, reason: r.motivo, userId: r.usuario_id, date: r.fecha.toISOString() })),
    };
  }
}
