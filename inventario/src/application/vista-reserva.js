import { EstadoReserva } from '../domain/tipos.js';
/** Representación de la reserva de un pedido: estado agregado + cantidades (ADR-020). */
export function vistaReserva(orderId, rows) {
  const estado = rows.some((r) => r.estado === EstadoReserva.ACTIVA) ? EstadoReserva.ACTIVA
    : rows.some((r) => r.estado === EstadoReserva.LIQUIDADA) ? EstadoReserva.LIQUIDADA : rows.at(-1).estado;
  const items = rows.filter((r) => r.estado === estado);
  return {
    orderId, status: estado,
    items: items.map((r) => ({ productId: r.productoId, quantity: r.cantidad })),
    expiresAt: new Date(Math.max(...items.map((r) => r.venceEn.getTime()))).toISOString(),
  };
}
