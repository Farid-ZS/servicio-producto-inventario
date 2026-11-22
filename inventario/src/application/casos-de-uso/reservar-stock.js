import { randomUUID } from 'node:crypto';
import { DomainError, invalid, esUuid } from '../../domain/errors.js';
import { Reserva, normalizarLineas, validarReserva } from '../../domain/reserva.js';
import { EstadoReserva } from '../../domain/tipos.js';
import { exigirPermiso } from '../autorizacion.js';
import { ejecutarIdempotente, exigirClave } from '../idempotencia.js';
import { vistaReserva } from '../vista-reserva.js';

/** CU-INV-04 / RF-INV-05/06 / ADR-007 (bloqueo pesimista ordenado) / ADR-020 / ADR-023. */
export class ReservarStock {
  constructor({ uow, publicador, reloj = () => new Date(), ttlMinutos = 60 }) { Object.assign(this, { uow, publicador, reloj, ttlMinutos }); }

  async ejecutar({ orderId, items, expiresAt }, { idempotencyKey }, actor) {
    exigirPermiso(actor, 'inventory:reservations');
    exigirClave(idempotencyKey);
    if (!esUuid(orderId)) throw invalid('orderId inválido');
    const lineas = normalizarLineas(items);
    const ahora = this.reloj();
    const vence = expiresAt ? new Date(expiresAt) : new Date(ahora.getTime() + this.ttlMinutos * 60_000);
    if (Number.isNaN(vence.getTime()) || vence <= ahora) throw invalid('expiresAt debe ser una fecha futura');
    const cambios = [];

    const { resultado, repetido } = await this.uow.ejecutar((repos) => ejecutarIdempotente(
      repos, { clave: idempotencyKey, operacion: 'RESERVE', payload: { orderId, items: lineas, expiresAt: expiresAt ?? null }, ahora },
      async () => {
        const previas = await repos.reservas.bloquearPorPedido(orderId);
        if (previas.some((r) => r.estado === EstadoReserva.ACTIVA || r.estado === EstadoReserva.LIQUIDADA)) {
          throw new DomainError('INVALID_REQUEST', 'El pedido ya tiene una reserva', { orderId }, 409);
        }
        const stocks = await repos.stocks.bloquear(lineas.map((l) => l.productId)); // FOR UPDATE, orden por productId
        validarReserva(lineas, stocks); // todo-o-nada: aquí aún no se modificó nada
        const nuevas = lineas.map((l) => new Reserva({ id: randomUUID(), pedidoId: orderId, productoId: l.productId, cantidad: l.quantity, venceEn: vence }));
        for (const l of lineas) { const s = stocks.get(l.productId); s.reservar(l.quantity); await repos.stocks.guardar(s); cambios.push(s.instantanea('RESERVA')); }
        await repos.reservas.crear(nuevas);
        return vistaReserva(orderId, nuevas);
      }));
    if (!repetido) await this.publicador.publicar(cambios);
    return resultado;
  }
}
