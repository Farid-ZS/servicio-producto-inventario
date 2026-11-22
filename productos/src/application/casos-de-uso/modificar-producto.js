import { DomainError, invalid } from '../../domain/errors.js';
import { exigirPermiso } from '../autorizacion.js';

/** CU-PRO-05 / RF-PRO-04 */
export class ModificarProducto {
  constructor({ productos, categorias }) { Object.assign(this, { productos, categorias }); }

  async ejecutar(id, cambios, actor) {
    exigirPermiso(actor, 'products:write');
    const p = await this.productos.porId(id);
    if (!p) throw new DomainError('PRODUCT_NOT_FOUND', 'El producto no existe', { productId: id });
    if (cambios.categoriaId && cambios.categoriaId !== p.categoriaId) {
      const cat = await this.categorias.porId(cambios.categoriaId);
      if (!cat) throw new DomainError('CATEGORY_NOT_FOUND', 'La nueva categoría no existe', { categoryId: cambios.categoriaId });
      if (!cat.activa) throw invalid('La categoría está inactiva', { categoryId: cat.id });
    }
    p.modificar(cambios); // valida precio, inmutabilidad del código, etc.
    await this.productos.actualizar(p);
    return p;
  }
}
