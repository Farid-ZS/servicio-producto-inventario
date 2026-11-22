export class RepositorioAlertasPg {
  constructor(pool) { this.pool = pool; }
  async registrar({ productoId, stockDisponible, stockMinimo }) {
    await this.pool.query(`INSERT INTO alertas_stock (producto_id, stock_disponible, stock_minimo) VALUES ($1,$2,$3)
      ON CONFLICT (producto_id) DO UPDATE SET stock_disponible=EXCLUDED.stock_disponible, stock_minimo=EXCLUDED.stock_minimo, actualizada_en=now()`, [productoId, stockDisponible, stockMinimo]);
  }
  async resolver(productoId) { await this.pool.query('DELETE FROM alertas_stock WHERE producto_id=$1', [productoId]); }
  async listar() {
    const { rows } = await this.pool.query('SELECT * FROM alertas_stock ORDER BY actualizada_en DESC');
    return rows.map((r) => ({ productId: r.producto_id, availableStock: r.stock_disponible, minimumStock: r.stock_minimo, updatedAt: r.actualizada_en.toISOString() }));
  }
}
