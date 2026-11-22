import { Stock } from '../../domain/stock.js';
import { invalid, esUuid } from '../../domain/errors.js';

/** El evento aún no puede aplicarse (llegó adelantado): el consumidor lo retiene y reintenta (ADR-025). */
export class EventoNoListoError extends Error {
  constructor(msg) { super(msg); this.name = 'EventoNoListoError'; this.reintentable = true; }
}

/**
 * ADR-025: Productos es la autoridad del ciclo de vida. Idempotente y tolerante a duplicados/desorden mediante `version`.
 * ProductoCreado => fila de stock en cero; Activado/Desactivado => habilita/impide NUEVAS reservas (las vigentes se conservan).
 */
export class SincronizarCicloVidaProducto {
  constructor({ uow }) { this.uow = uow; }

  async ejecutar(evento) {
    const { eventType, aggregateId: id, version } = evento ?? {};
    if (!['ProductoCreado', 'ProductoActivado', 'ProductoDesactivado'].includes(eventType) || !esUuid(id) || !Number.isInteger(version)) {
      throw invalid('Evento de producto inválido', { eventType });
    }
    return this.uow.ejecutar(async (repos) => {
      const s = (await repos.stocks.bloquear([id])).get(id);
      if (eventType === 'ProductoCreado') {
        if (s) return 'IGNORADO_DUPLICADO';
        await repos.stocks.crear(new Stock({ productoId: id, version, productoActivo: true }));
        return 'CREADO';
      }
      if (!s) throw new EventoNoListoError(`Falta ProductoCreado para ${id}`);
      if (version <= s.version) return 'IGNORADO_ANTIGUO'; // duplicado o atrasado
      if (version > s.version + 1) throw new EventoNoListoError(`Evento adelantado: v${version}, actual v${s.version}`);
      s.productoActivo = eventType === 'ProductoActivado'; s.version = version;
      await repos.stocks.guardar(s);
      return 'APLICADO';
    });
  }
}
