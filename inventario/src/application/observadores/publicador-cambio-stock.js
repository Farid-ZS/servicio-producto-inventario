import { logger } from '../../shared/logger.js';
/**
 * OBSERVER (ADR-014), intra-servicio. Se publica DESPUÉS del commit; si un observador falla se registra y
 * no se revierte la operación. Solo alimenta alertas y caché informativa (consistencia eventual).
 */
export class PublicadorCambioStock {
  observadores = [];
  constructor(log = logger) { this.log = log; }
  suscribir(o) { this.observadores.push(o); return this; }
  async publicar(cambios) {
    for (const c of cambios) {
      await Promise.all(this.observadores.map(async (o) => {
        try { await o.alCambiarStock(c); } catch (error) { this.log.error({ error, observador: o.constructor.name, productId: c.productoId }, 'observador falló'); }
      }));
    }
  }
}
export class ObservadorAlertaStockBajo { // CU-INV-07 / RF-INV-10 / ADR-009
  constructor(alertas) { this.alertas = alertas; }
  async alCambiarStock(c) {
    if (c.stockMinimo === null || c.stockMinimo === undefined) return; // sin mínimo: no se evalúa
    if (c.stockDisponible <= c.stockMinimo) await this.alertas.registrar({ productoId: c.productoId, stockDisponible: c.stockDisponible, stockMinimo: c.stockMinimo });
    else await this.alertas.resolver(c.productoId);
  }
}
export class ObservadorInvalidarCache { // ADR-028
  constructor(cache) { this.cache = cache; }
  async alCambiarStock(c) { await this.cache.invalidar([c.productoId]); }
}
