import { DomainError } from '../../domain/errors.js';
import { eventoProducto } from '../../domain/eventos.js';
import { exigirPermiso } from '../autorizacion.js';

/** CU-PRO-06 / RF-PRO-05. Inventario se entera por evento (ADR-025); las reservas vigentes no se tocan. */
export class CambiarEstadoProducto {
  constructor({ productos, reloj = () => new Date() }) { Object.assign(this, { productos, reloj }); }

  async #cambiar(id, actor, accion, tipoEvento) {
    exigirPermiso(actor, 'products:write');
    const p = await this.productos.porId(id);
    if (!p) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe', { productId: id });
    if (!p[accion]()) return p; // idempotente: sin cambio no hay evento
    await this.productos.actualizar(p, eventoProducto(tipoEvento, p, this.reloj()));
    return p;
  }
  activar(id, actor) { return this.#cambiar(id, actor, 'activar', 'ProductoActivado'); }
  desactivar(id, actor) { return this.#cambiar(id, actor, 'desactivar', 'ProductoDesactivado'); }
}
