import { randomUUID } from 'node:crypto';
import { DomainError, invalid, esUuid } from '../../domain/errors.js';
import { EstadoReserva, TipoMovimiento } from '../../domain/tipos.js';
import { exigirPermiso, usuarioResponsable } from '../autorizacion.js';
import { ejecutarIdempotente, exigirClave } from '../idempotencia.js';
import { vistaReserva } from '../vista-reserva.js';

/** CU-INV-08 / RF-INV-11 / ADR-026: convierte la reserva en salida por VENTA, atómica e idempotente. */
export class LiquidarReserva {
  constructor({ uow, publicador, estrategias, reloj = () => new Date() }) { Object.assign(this, { uow, publicador, estrategias, reloj }); }

  async ejecutar({ orderId }, { idempotencyKey }, actor) {
    exigirPermiso(actor, 'inventory:reservations');
    exigirClave(idempotencyKey);
    if (!esUuid(orderId)) throw invalid('orderId inválido');
    const ahora = this.reloj(); const cambios = [];
    const venta = this.estrategias.obtener(TipoMovimiento.VENTA);

    const { resultado, repetido } = await this.uow.ejecutar((repos) => ejecutarIdempotente(
      repos, { clave: idempotencyKey, operacion: 'LIQUIDATE', payload: { orderId }, ahora },
      async () => {
        const filas = await repos.reservas.bloquearPorPedido(orderId);
        if (!filas.length) throw new DomainError('RESERVATION_NOT_FOUND', 'No existe reserva para el pedido', { orderId });
        const activas = filas.filter((r) => r.activa);
        if (!activas.length) {
          if (filas.some((r) => r.estado === EstadoReserva.LIQUIDADA)) return vistaReserva(orderId, filas); // ya liquidada: no vuelve a descontar
          if (filas.some((r) => r.estado === EstadoReserva.EXPIRADA)) throw new DomainError('RESERVATION_EXPIRED', 'La reserva expiró', { orderId });
          throw new DomainError('RESERVATION_NOT_FOUND', 'La reserva fue liberada', { orderId, reason: 'RELEASED' });
        }
        if (activas.some((r) => r.estaVencida(ahora))) throw new DomainError('RESERVATION_EXPIRED', 'La reserva superó su vigencia técnica', { orderId });

        const stocks = await repos.stocks.bloquear([...new Set(activas.map((r) => r.productoId))]);
        for (const r of activas) {
          const s = stocks.get(r.productoId);
          s.aplicar(venta.calcular(s, r.cantidad));
          await repos.movimientos.registrar({ id: randomUUID(), productoId: r.productoId, pedidoId: orderId, tipo: TipoMovimiento.VENTA, cantidad: r.cantidad, motivo: 'Venta de pedido pagado', usuarioId: usuarioResponsable(actor), fecha: ahora });
          r.estado = EstadoReserva.LIQUIDADA;
        }
        for (const s of stocks.values()) { await repos.stocks.guardar(s); cambios.push(s.instantanea('LIQUIDACION')); }
        await repos.reservas.actualizarEstado(activas.map((r) => r.id), EstadoReserva.LIQUIDADA);
        return vistaReserva(orderId, filas);
      }));
    if (!repetido) await this.publicador.publicar(cambios);
    return resultado;
  }
}
