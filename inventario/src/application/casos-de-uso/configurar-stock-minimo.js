import { DomainError, invalid, esUuid } from '../../domain/errors.js';
import { exigirPermiso } from '../autorizacion.js';

/** RF-INV-10 / ADR-009: el mínimo es un dato por producto leído en ejecución (null = sin alerta). */
export class ConfigurarStockMinimo {
  constructor({ uow, publicador }) { Object.assign(this, { uow, publicador }); }
  async ejecutar({ productId, minimumStock }, actor) {
    exigirPermiso(actor, 'inventory:admin');
    if (!esUuid(productId)) throw invalid('productId inválido');
    if (minimumStock !== null && (!Number.isInteger(minimumStock) || minimumStock < 0)) throw invalid('minimumStock debe ser un entero >= 0 o null');
    const cambios = [];
    const r = await this.uow.ejecutar(async (repos) => {
      const s = (await repos.stocks.bloquear([productId])).get(productId);
      if (!s) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no tiene registro de inventario', { productId });
      s.stockMinimo = minimumStock; await repos.stocks.guardar(s); cambios.push(s.instantanea('CONFIG_MINIMO'));
      return { productId, minimumStock: s.stockMinimo, availableStock: s.disponible };
    });
    await this.publicador.publicar(cambios);
    return r;
  }
}
