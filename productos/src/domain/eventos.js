import { randomUUID } from 'node:crypto';
/** Evento de integración (ADR-024): eventId, eventType, occurredAt, aggregateId, version, payload. */
export const eventoProducto = (eventType, p, ahora = new Date()) => ({
  eventId: randomUUID(),
  eventType, // ProductoCreado | ProductoActivado | ProductoDesactivado
  occurredAt: ahora.toISOString(),
  aggregateId: p.id,
  version: p.version,
  payload: { productId: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado },
});
