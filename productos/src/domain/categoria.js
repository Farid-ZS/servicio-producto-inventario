import { invalid } from './errors.js';

export const EstadoCategoria = Object.freeze({ ACTIVA: 'ACTIVA', INACTIVA: 'INACTIVA' });

export class Categoria {
  constructor({ id, nombre, descripcion = null, estado = EstadoCategoria.ACTIVA, categoriaPadreId = null }) {
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120) throw invalid('Nombre de categoría inválido');
    this.id = id;
    this.nombre = nombre.trim();
    this.descripcion = descripcion ?? null;
    this.estado = estado;
    this.categoriaPadreId = categoriaPadreId ?? null;
  }
  static desde(obj) { return new Categoria(obj); }
  modificar({ nombre, descripcion }) {
    if (nombre !== undefined) Object.assign(this, new Categoria({ ...this, nombre }));
    if (descripcion !== undefined) this.descripcion = descripcion;
    return this;
  }
  get activa() { return this.estado === EstadoCategoria.ACTIVA; }
  toJSON() { return { ...this }; }
}
