import { DomainError } from './errors.js';

/** Agregado Stock (raíz del agregado Inventario). disponible = fisico - reservado, nunca negativo. */
export class Stock {
  constructor({ productoId, stockFisico = 0, stockReservado = 0, stockMinimo = null, version = 0, productoActivo = true }) {
    Object.assign(this, { productoId, stockFisico, stockReservado, stockMinimo, version, productoActivo });
  }
  get disponible() { return this.stockFisico - this.stockReservado; }

  reservar(cantidad) {
    if (cantidad > this.disponible) throw new DomainError('INSUFFICIENT_STOCK', 'Stock disponible insuficiente', { productId: this.productoId, requested: cantidad, available: this.disponible });
    this.stockReservado += cantidad;
  }
  liberar(cantidad) { this.stockReservado = Math.max(0, this.stockReservado - cantidad); }

  /** Aplica el resultado de una estrategia y verifica las invariantes (última defensa; la BD tiene CHECK equivalentes). */
  aplicar({ deltaFisico, deltaReservado }) {
    const fisico = this.stockFisico + deltaFisico;
    const reservado = this.stockReservado + deltaReservado;
    if (fisico < 0) throw new DomainError('INSUFFICIENT_STOCK', 'El stock físico no puede quedar por debajo de cero', { productId: this.productoId, physicalStock: this.stockFisico });
    if (reservado < 0 || reservado > fisico) throw new DomainError('RESERVED_STOCK_CONFLICT', 'La operación dejaría reservas sin respaldo físico', { productId: this.productoId });
    this.stockFisico = fisico; this.stockReservado = reservado;
  }

  /** Estado visible para observadores (alerta y caché). */
  instantanea(origen) {
    return { productoId: this.productoId, stockFisico: this.stockFisico, stockReservado: this.stockReservado, stockDisponible: this.disponible, stockMinimo: this.stockMinimo, origen };
  }
}
