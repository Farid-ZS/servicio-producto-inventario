import { randomUUID } from 'node:crypto';
import { EstadoReserva } from '../../domain/tipos.js';

/**
 * ADR-015: worker de SEGURIDAD. Libera reservas ACTIVAS con vence_en vencido (FOR UPDATE SKIP LOCKED),
 * en una transacción; es idempotente (nunca toca reservas liquidadas/liberadas). Publica ReservaExpirada vía Outbox.
 * Redis no participa en la expiración.
 */
export class ExpirarReservasVencidas {
  constructor({ uow, publicador, reloj = () => new Date(), lote = 200 }) { Object.assign(this, { uow, publicador, reloj, lote }); }

  async ejecutar() {
    let total = 0;
    for (let i = 0; i < 50; i++) { // tope de lotes por ciclo
      const ahora = this.reloj(); const cambios = [];
      const n = await this.uow.ejecutar(async (repos) => {
        const vencidas = await repos.reservas.bloquearVencidasActivas(ahora, this.lote);
        if (!vencidas.length) return 0;
        const stocks = await repos.stocks.bloquear([...new Set(vencidas.map((r) => r.productoId))]);
        const porPedido = new Map();
        for (const r of vencidas) {
          stocks.get(r.productoId)?.liberar(r.cantidad); r.estado = EstadoReserva.EXPIRADA;
          porPedido.set(r.pedidoId, [...(porPedido.get(r.pedidoId) ?? []), r]);
        }
        for (const s of stocks.values()) { await repos.stocks.guardar(s); cambios.push(s.instantanea('EXPIRACION')); }
        await repos.reservas.actualizarEstado(vencidas.map((r) => r.id), EstadoReserva.EXPIRADA);
        for (const [pedidoId, rs] of porPedido) {
          await repos.outbox.encolar({
            eventId: randomUUID(), eventType: 'ReservaExpirada', occurredAt: ahora.toISOString(), aggregateId: pedidoId, version: 1,
            payload: { orderId: pedidoId, items: rs.map((r) => ({ productId: r.productoId, quantity: r.cantidad })) },
          });
        }
        await repos.idempotencia.purgar(new Date(ahora.getTime() - 24 * 3600 * 1000)); // higiene: claves de más de 24 h
        return vencidas.length;
      });
      await this.publicador.publicar(cambios);
      total += n;
      if (n < this.lote) break;
    }
    return total;
  }
}
