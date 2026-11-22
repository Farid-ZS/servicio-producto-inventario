import { invalid, esUuid } from '../../domain/errors.js';
import { exigirPermiso } from '../autorizacion.js';

/** CU-INV-01 / RF-INV-01 / ADR-019: GET /inventory/availability?productIds=... (máx. 100). */
export class ConsultarDisponibilidad {
  constructor({ disponibilidad }) { this.disponibilidad = disponibilidad; }
  async ejecutar({ productIds }, actor) {
    exigirPermiso(actor, 'inventory:availability:read');
    const ids = [...new Set(productIds ?? [])];
    if (ids.length === 0 || ids.length > 100) throw invalid('productIds debe contener entre 1 y 100 identificadores');
    if (!ids.every(esUuid)) throw invalid('productIds contiene identificadores inválidos');
    const { items, source } = await this.disponibilidad.consultarPorLote(ids);
    const por = new Map(items.map((i) => [i.productId, i]));
    // producto sin stock registrado => disponibilidad 0 (CU-INV-01)
    return { source, items: ids.map((id) => por.get(id) ?? { productId: id, physicalStock: 0, reservedStock: 0, availableStock: 0 }) };
  }
}
