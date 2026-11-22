import { invalid } from './errors.js';

export const EstadoProducto = Object.freeze({ ACTIVO: 'ACTIVO', INACTIVO: 'INACTIVO' });

/** Objeto de valor: monto no negativo con moneda (PEN). */
export class Dinero {
  constructor(monto, moneda = 'PEN') {
    const n = typeof monto === 'string' && monto.trim() !== '' ? Number(monto) : monto;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw invalid('El precio de venta debe ser un número mayor o igual a cero');
    this.monto = Math.round(n * 100) / 100;
    this.moneda = moneda;
    Object.freeze(this);
  }
}

const validarTexto = (v, campo, max, obligatorio = true) => {
  if (v === undefined || v === null || v === '') {
    if (obligatorio) throw invalid(`${campo} es obligatorio`);
    return null;
  }
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > max) throw invalid(`${campo} inválido (máx. ${max} caracteres)`);
  return v.trim();
};

export class Producto {
  constructor({ id, codigo, nombre, descripcion = null, precioVenta, estado, categoriaId, version = 1 }) {
    this.id = id;
    this.codigo = codigo;
    this.nombre = validarTexto(nombre, 'El nombre', 200);
    this.descripcion = validarTexto(descripcion, 'La descripción', 2000, false);
    this.precioVenta = new Dinero(precioVenta).monto;
    if (!Object.values(EstadoProducto).includes(estado)) throw invalid('Estado de producto inválido');
    this.estado = estado;
    if (!categoriaId) throw invalid('La categoría es obligatoria');
    this.categoriaId = categoriaId;
    this.version = version;
  }

  /** RF-PRO-01: el producto nace ACTIVO. El código lo asigna el sistema (ADR-016). */
  static registrar({ id, codigo, nombre, descripcion, precioVenta, categoriaId }) {
    return new Producto({ id, codigo, nombre, descripcion, precioVenta, categoriaId, estado: EstadoProducto.ACTIVO, version: 1 });
  }
  static desde(obj) { return new Producto(obj); }

  /** RF-PRO-04. El código es inmutable (CU-PRO-05). Un producto inactivo puede modificarse pero no reactivarse aquí. */
  modificar(cambios) {
    if ('codigo' in cambios && cambios.codigo !== this.codigo) throw invalid('El código del producto es inmutable');
    if ('estado' in cambios && cambios.estado !== this.estado) throw invalid('El estado se cambia con activar/desactivar');
    const n = { ...this, ...Object.fromEntries(['nombre', 'descripcion', 'precioVenta', 'categoriaId'].filter((k) => k in cambios).map((k) => [k, cambios[k]])) };
    Object.assign(this, new Producto(n));
    return this;
  }
  activar() { if (this.estado === EstadoProducto.ACTIVO) return false; this.estado = EstadoProducto.ACTIVO; this.version += 1; return true; }
  desactivar() { if (this.estado === EstadoProducto.INACTIVO) return false; this.estado = EstadoProducto.INACTIVO; this.version += 1; return true; }
  get activo() { return this.estado === EstadoProducto.ACTIVO; }
  toJSON() {
    const { id, codigo, nombre, descripcion, precioVenta, estado, categoriaId, version } = this;
    return { id, codigo, nombre, descripcion, precioVenta, estado, categoriaId, version };
  }
}
