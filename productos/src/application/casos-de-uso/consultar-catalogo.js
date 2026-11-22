import { DomainError, invalid } from '../../domain/errors.js';
import { exigirPermiso } from '../autorizacion.js';

const TAM_MAX = 100; // = tamaño máximo del lote de Inventario (ADR-006)

/**
 * CU-PRO-02/03/04. Productos NO guarda stock: lo pide a Inventario (ADR-001).
 * Si Inventario falla, se propaga REQUEST_TIMEOUT / SERVICE_UNAVAILABLE y nada se muestra como disponible (ADR-003).
 */
export class ConsultarCatalogo {
  constructor({ productos, disponibilidad }) { Object.assign(this, { productos, disponibilidad }); }

  async #componer(items, ctx) {
    const ids = items.filter((p) => p.activo).map((p) => p.id);
    const mapa = ids.length ? await this.disponibilidad.consultarPorLote(ids, ctx) : new Map();
    return items.map((p) => ({
      ...p.toJSON(),
      disponibilidad: p.activo
        ? { verificada: true, stockDisponible: mapa.get(p.id) ?? 0 }
        : { verificada: true, stockDisponible: 0, motivo: 'PRODUCTO_INACTIVO' }, // desactivado: no se consulta su stock
    }));
  }

  async detalle(id, actor, ctx = {}) {
    exigirPermiso(actor, 'products:read');
    const p = await this.productos.porId(id);
    if (!p) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe', { productId: id });
    return (await this.#componer([p], ctx))[0];
  }

  async buscar({ texto, categoriaId, estado, page = 1, size = 20 } = {}, actor, ctx = {}) {
    exigirPermiso(actor, 'products:read');
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > TAM_MAX) {
      throw invalid(`Paginación inválida (page >= 1, 1 <= size <= ${TAM_MAX})`);
    }
    if (estado && !['ACTIVO', 'INACTIVO'].includes(estado)) throw invalid('Estado inválido');
    const r = await this.productos.buscar({ texto: texto?.trim() || undefined, categoriaId, estado, page, size });
    return { items: await this.#componer(r.items, ctx), total: r.total, page, size };
  }
}
