import { randomUUID } from 'node:crypto';
import { Categoria, EstadoCategoria } from '../../domain/categoria.js';
import { DomainError, invalid } from '../../domain/errors.js';
import { exigirPermiso } from '../autorizacion.js';

/** CU-PRO-00 / RF-PRO-07 */
export class GestionarCategorias {
  constructor({ categorias, productos }) { this.categorias = categorias; this.productos = productos; }

  async #obtener(id) {
    const c = await this.categorias.porId(id);
    if (!c) throw new DomainError('CATEGORY_NOT_FOUND', 'La categoría no existe', { categoryId: id });
    return c;
  }

  async crear({ nombre, descripcion, categoriaPadreId }, actor) {
    exigirPermiso(actor, 'products:write');
    if (categoriaPadreId) await this.#obtener(categoriaPadreId); // el padre debe existir
    const c = new Categoria({ id: randomUUID(), nombre, descripcion, categoriaPadreId, estado: EstadoCategoria.ACTIVA });
    await this.categorias.crear(c);
    return c;
  }

  async modificar(id, { nombre, descripcion, categoriaPadreId }, actor) {
    exigirPermiso(actor, 'products:write');
    const c = await this.#obtener(id);
    c.modificar({ nombre, descripcion });
    if (categoriaPadreId !== undefined && categoriaPadreId !== c.categoriaPadreId) {
      if (categoriaPadreId !== null) {
        await this.#obtener(categoriaPadreId);
        const descendientes = await this.categorias.descendientes(id);
        if (categoriaPadreId === id || descendientes.includes(categoriaPadreId)) {
          throw new DomainError('CATEGORY_CYCLE', 'Una categoría no puede ser su propio ancestro', { categoryId: id, parentId: categoriaPadreId });
        }
      }
      c.categoriaPadreId = categoriaPadreId;
    }
    await this.categorias.actualizar(c);
    return c;
  }

  /** No se desactiva si hay productos activos en ella ni en sus descendientes (cualquier nivel). */
  async desactivar(id, actor) {
    exigirPermiso(actor, 'products:write');
    const c = await this.#obtener(id);
    if (!c.activa) return c;
    const ids = [id, ...(await this.categorias.descendientes(id))];
    const activos = await this.productos.listarActivosPorCategorias(ids, 50);
    if (activos.length) {
      throw new DomainError('CATEGORY_HAS_ACTIVE_PRODUCTS', 'Resuelva primero los productos activos asociados', {
        products: activos.map((p) => ({ id: p.id, codigo: p.codigo, categoryId: p.categoriaId })),
      });
    }
    c.estado = EstadoCategoria.INACTIVA;
    await this.categorias.actualizar(c);
    return c;
  }

  async activar(id, actor) {
    exigirPermiso(actor, 'products:write');
    const c = await this.#obtener(id);
    c.estado = EstadoCategoria.ACTIVA;
    await this.categorias.actualizar(c);
    return c;
  }

  async listar(actor) { exigirPermiso(actor, 'products:read'); return this.categorias.listar(); }
}
