import { TipoMovimiento } from '../tipos.js';
import { DomainError, invalid } from '../errors.js';

const entero = (c, permitirNegativo = false) => {
  if (!Number.isInteger(c) || c === 0 || (!permitirNegativo && c < 0)) throw invalid('La cantidad debe ser un entero ' + (permitirNegativo ? 'distinto de cero' : 'positivo'));
};
const utilizable = (s) => ({ physicalStock: s.stockFisico, reservedStock: s.stockReservado, usableStock: s.disponible });

/** STRATEGY (ADR-013). Cada una valida y calcula {deltaFisico, deltaReservado, cantidadRegistrada}; no persiste nada. */
export class EstrategiaEntrada {
  tipo = TipoMovimiento.ENTRADA; manual = true;
  calcular(_s, c) { entero(c); return { deltaFisico: c, deltaReservado: 0, cantidadRegistrada: c }; }
}
export class EstrategiaSalida {
  tipo = TipoMovimiento.SALIDA; manual = true;
  calcular(s, c) {
    entero(c);
    if (c > s.stockFisico) throw new DomainError('INSUFFICIENT_STOCK', 'La salida supera el stock físico', utilizable(s)); // RF-INV-08
    if (c > s.disponible) throw new DomainError('RESERVED_STOCK_CONFLICT', 'La salida comprometería unidades reservadas', utilizable(s)); // ADR-027
    return { deltaFisico: -c, deltaReservado: 0, cantidadRegistrada: c };
  }
}
export class EstrategiaAjuste {
  tipo = TipoMovimiento.AJUSTE; manual = true;
  calcular(s, c) {
    entero(c, true);
    const nuevo = s.stockFisico + c;
    if (nuevo < 0) throw new DomainError('INSUFFICIENT_STOCK', 'El ajuste dejaría el stock físico por debajo de cero', utilizable(s));
    if (c < 0 && nuevo < s.stockReservado) throw new DomainError('RESERVED_STOCK_CONFLICT', 'El ajuste dejaría stock físico menor al reservado', utilizable(s));
    return { deltaFisico: c, deltaReservado: 0, cantidadRegistrada: c };
  }
}
/** Solo la usa `liquidate` (ADR-027): consume unidades reservadas; no se expone como operación manual. */
export class EstrategiaVenta {
  tipo = TipoMovimiento.VENTA; manual = false;
  calcular(s, c) {
    entero(c);
    if (c > s.stockReservado || c > s.stockFisico) throw new DomainError('RESERVATION_NOT_FOUND', 'La reserva no respalda la cantidad vendida', { productId: s.productoId });
    return { deltaFisico: -c, deltaReservado: -c, cantidadRegistrada: c };
  }
}

export class RegistroEstrategias {
  constructor(estrategias = [new EstrategiaEntrada(), new EstrategiaSalida(), new EstrategiaAjuste(), new EstrategiaVenta()]) {
    this.m = new Map(estrategias.map((e) => [e.tipo, e]));
  }
  /** Agregar un tipo nuevo (p. ej. DEVOLUCION) = una clase + registrarla aquí; no toca reservas ni Productos. */
  obtener(tipo) {
    const e = this.m.get(tipo);
    if (!e) throw invalid('Tipo de movimiento no soportado', { type: tipo });
    return e;
  }
  manual(tipo) {
    const e = this.obtener(tipo);
    if (!e.manual) throw invalid('Este tipo de movimiento no puede registrarse manualmente', { type: tipo });
    return e;
  }
}
