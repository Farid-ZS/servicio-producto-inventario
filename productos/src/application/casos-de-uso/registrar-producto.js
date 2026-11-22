import { randomUUID } from 'node:crypto';
import { Producto } from '../../domain/producto.js';
import { DomainError, invalid } from '../../domain/errors.js';
import { eventoProducto } from '../../domain/eventos.js';
import { exigirPermiso } from '../autorizacion.js';

/** CU-PRO-01 / RF-PRO-01 / RF-PRO-06 / ADR-016 */
export class RegistrarProducto {
  constructor({ productos, categorias, generarCodigo, maxReintentos = 5, reloj = () => new Date() }) {
    Object.assign(this, { productos, categorias, generarCodigo, maxReintentos, reloj });
  }

  async ejecutar({ nombre, descripcion, categoriaId, precioVenta }, actor) {
    exigirPermiso(actor, 'products:write');
    const cat = await this.categorias.porId(categoriaId);
    if (!cat) throw new DomainError('CATEGORY_NOT_FOUND', 'La categoría indicada no existe; seleccione una válida', { categoryId: categoriaId });
    if (!cat.activa) throw invalid('La categoría está inactiva', { categoryId: categoriaId });

    for (let intento = 1; intento <= this.maxReintentos; intento++) {
      const p = Producto.registrar({ id: randomUUID(), codigo: this.generarCodigo(), nombre, descripcion, precioVenta, categoriaId });
      try {
        // producto + evento ProductoCreado en la MISMA transacción (Outbox, ADR-024)
        await this.productos.crear(p, eventoProducto('ProductoCreado', p, this.reloj()));
        return p;
      } catch (e) {
        if (e instanceof DomainError && e.code === 'CODIGO_DUPLICADO') continue; // colisión: se reintenta sin exponerla
        throw e;
      }
    }
    throw new DomainError('SERVICE_UNAVAILABLE', 'No fue posible generar un código único; reintente', { attempts: this.maxReintentos });
  }
}
