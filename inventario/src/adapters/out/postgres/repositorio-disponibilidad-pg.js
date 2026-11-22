/** Lectura de disponibilidad (real). La reserva NO usa esto: bloquea el stock vía UnidadDeTrabajo. */
export class RepositorioDisponibilidadPg {
  constructor(pool) { this.pool = pool; }
  async consultarPorLote(ids) {
    const { rows } = await this.pool.query('SELECT producto_id, stock_fisico, stock_reservado FROM stock WHERE producto_id = ANY($1::uuid[])', [ids]);
    return {
      source: 'db',
      items: rows.map((r) => ({ productId: r.producto_id, physicalStock: r.stock_fisico, reservedStock: r.stock_reservado, availableStock: r.stock_fisico - r.stock_reservado })),
    };
  }
}
