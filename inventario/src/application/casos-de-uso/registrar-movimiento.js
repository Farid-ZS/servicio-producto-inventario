import { randomUUID } from 'node:crypto';
import { DomainError, invalid, esUuid } from '../../domain/errors.js';
import { exigirPermiso, usuarioResponsable } from '../autorizacion.js';

/** CU-INV-02/03 / RF-INV-02..04, 08: entrada, salida o ajuste manual. La estrategia valida; el servicio solo orquesta. */
export class RegistrarMovimiento {
  constructor({ uow, publicador, estrategias, reloj = () => new Date() }) { Object.assign(this, { uow, publicador, estrategias, reloj }); }

  async ejecutar({ productId, type, quantity, reason }, actor) {
    exigirPermiso(actor, 'inventory:write');
    if (!esUuid(productId)) throw invalid('productId inválido');
    if (typeof reason !== 'string' || !reason.trim()) throw invalid('El motivo es obligatorio');
    const estrategia = this.estrategias.manual(type); // VENTA no es manual (ADR-027)
    const cambios = [];
    const mov = await this.uow.ejecutar(async (repos) => {
      const stocks = await repos.stocks.bloquear([productId]);
      const s = stocks.get(productId);
      if (!s) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no tiene registro de inventario', { productId });
      s.aplicar(estrategia.calcular(s, quantity)); // reglas de stock/reservas
      const m = { id: randomUUID(), productoId: productId, pedidoId: null, tipo: type, cantidad: quantity, motivo: reason.trim(), usuarioId: usuarioResponsable(actor), fecha: this.reloj() };
      await repos.stocks.guardar(s); // stock + movimiento en UNA transacción (ADR-005)
      await repos.movimientos.registrar(m);
      cambios.push(s.instantanea(type));
      return { movementId: m.id, productId, type, quantity, reason: m.motivo, userId: m.usuarioId, date: m.fecha.toISOString(), physicalStock: s.stockFisico, reservedStock: s.stockReservado, availableStock: s.disponible };
    });
    await this.publicador.publicar(cambios);
    return mov;
  }
}
