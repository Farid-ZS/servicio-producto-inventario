import { DomainError, invalid, esUuid } from '../../domain/errors.js';
import { EstadoReserva } from '../../domain/tipos.js';
import { exigirPermiso } from '../autorizacion.js';
import { ejecutarIdempotente, exigirClave } from '../idempotencia.js';
import { vistaReserva } from '../vista-reserva.js';

/** CU-INV-05 / RF-INV-07: release por cancelación o vencimiento comercial (solicitado por Pedidos y Pagos). Idempotente. */
export class LiberarReserva {
  constructor({ uow, publicador, reloj = () => new Date() }) { Object.assign(this, { uow, publicador, reloj }); }

  async ejecutar({ orderId }, { idempotencyKey }, actor) {
    exigirPermiso(actor, 'inventory:reservations');
    exigirClave(idempotencyKey);
    if (!esUuid(orderId)) throw invalid('orderId inválido');
    const ahora = this.reloj(); const cambios = [];

    const { resultado, repetido } = await this.uow.ejecutar((repos) => ejecutarIdempotente(
      repos, { clave: idempotencyKey, operacion: 'RELEASE', payload: { orderId }, ahora },
      async () => {
        const filas = await repos.reservas.bloquearPorPedido(orderId);
        if (!filas.length) throw new DomainError('RESERVATION_NOT_FOUND', 'No existe reserva para el pedido', { orderId });
        const activas = filas.filter((r) => r.activa);
        if (!activas.length) {
          if (filas.some((r) => r.estado === EstadoReserva.LIQUIDADA)) {
            throw new DomainError('INVALID_REQUEST', 'El pedido ya fue pagado: sus unidades fueron consumidas por la venta', { orderId, reason: 'RESERVATION_ALREADY_LIQUIDATED' }, 409);
          }
          return vistaReserva(orderId, filas); // ya liberada o expirada: resultado idempotente
        }
        const stocks = await repos.stocks.bloquear([...new Set(activas.map((r) => r.productoId))]);
        for (const r of activas) { stocks.get(r.productoId).liberar(r.cantidad); r.estado = EstadoReserva.LIBERADA; }
        for (const s of stocks.values()) { await repos.stocks.guardar(s); cambios.push(s.instantanea('LIBERACION')); }
        await repos.reservas.actualizarEstado(activas.map((r) => r.id), EstadoReserva.LIBERADA);
        return vistaReserva(orderId, filas);
      }));
    if (!repetido) await this.publicador.publicar(cambios);
    return resultado;
  }
}
