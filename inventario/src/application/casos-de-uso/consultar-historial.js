import { invalid, esUuid } from '../../domain/errors.js';
import { TipoMovimiento } from '../../domain/tipos.js';
import { exigirPermiso } from '../autorizacion.js';

/** CU-INV-06 / RF-INV-09: filtros por producto, tipo y RangoFecha; paginado (índice producto+tipo+fecha). */
export class ConsultarHistorial {
  constructor({ historial }) { this.historial = historial; }
  async ejecutar({ productId, type, from, to, page = 1, size = 50 }, actor) {
    exigirPermiso(actor, 'inventory:history');
    if (!esUuid(productId)) throw invalid('productId inválido');
    if (type && !Object.values(TipoMovimiento).includes(type)) throw invalid('Tipo de movimiento inválido');
    const desde = from ? new Date(from) : undefined; const hasta = to ? new Date(to) : undefined;
    if ((desde && Number.isNaN(desde.getTime())) || (hasta && Number.isNaN(hasta.getTime()))) throw invalid('Fecha inválida');
    if (desde && hasta && desde > hasta) throw invalid('El rango de fechas es inválido (from > to)');
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > 200) throw invalid('Paginación inválida');
    return this.historial.consultar({ productoId: productId, tipo: type, desde, hasta, page, size });
  }
}
