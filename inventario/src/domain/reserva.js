import { EstadoReserva } from './tipos.js';
import { DomainError, invalid, esUuid } from './errors.js';

export class Reserva {
  constructor({ id, pedidoId, productoId, cantidad, estado = EstadoReserva.ACTIVA, venceEn }) {
    Object.assign(this, { id, pedidoId, productoId, cantidad, estado, venceEn: new Date(venceEn) });
  }
  get activa() { return this.estado === EstadoReserva.ACTIVA; }
  estaVencida(ahora) { return this.activa && this.venceEn.getTime() <= ahora.getTime(); }
}

/** Normaliza líneas: valida, une duplicadas y ordena por productId (orden de bloqueo anti-deadlock, ADR-007). */
export function normalizarLineas(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw invalid('items debe contener entre 1 y 500 líneas');
  const m = new Map();
  for (const it of items) {
    if (!esUuid(it?.productId)) throw invalid('productId inválido', { productId: it?.productId });
    if (!Number.isInteger(it?.quantity) || it.quantity <= 0) throw invalid('quantity debe ser un entero positivo', { productId: it.productId });
    m.set(it.productId, (m.get(it.productId) ?? 0) + it.quantity);
  }
  return [...m].sort(([a], [b]) => (a < b ? -1 : 1)).map(([productId, quantity]) => ({ productId, quantity }));
}

/** Política de reserva TODO-O-NADA (RF-INV-05/06): informa TODAS las líneas con problema y no aplica nada parcial. */
export function validarReserva(lineas, stocks) {
  const noEncontrados = lineas.filter((l) => !stocks.has(l.productId)).map((l) => l.productId);
  if (noEncontrados.length) throw new DomainError('PRODUCT_NOT_FOUND', 'Hay productos sin registro de inventario', { productIds: noEncontrados });
  const inactivos = lineas.filter((l) => !stocks.get(l.productId).productoActivo).map((l) => l.productId);
  if (inactivos.length) throw new DomainError('PRODUCT_INACTIVE', 'Hay productos inactivos: no admiten nuevas reservas', { productIds: inactivos });
  const faltantes = lineas.filter((l) => stocks.get(l.productId).disponible < l.quantity)
    .map((l) => ({ productId: l.productId, requested: l.quantity, available: stocks.get(l.productId).disponible }));
  if (faltantes.length) throw new DomainError('INSUFFICIENT_STOCK', 'Stock insuficiente: se rechaza la reserva completa', { items: faltantes });
}
