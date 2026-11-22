// Contratos hexagonales. verificarPuerto() se usa en main.js y en los tests para detectar adaptadores incompletos.
export const PUERTOS_ENTRADA = {
  ConsultarDisponibilidad: ['ejecutar'],
  ReservarStock: ['ejecutar'],
  LiberarReserva: ['ejecutar'],
  LiquidarReserva: ['ejecutar'],
  RegistrarMovimiento: ['ejecutar'],
  ConsultarHistorial: ['ejecutar'],
  ConfigurarStockMinimo: ['ejecutar'],
  ExpirarReservasVencidas: ['ejecutar'],
  SincronizarCicloVidaProducto: ['ejecutar'],
  ConsultarAlertas: ['ejecutar'],
};
/**
 * UnidadDeTrabajo.ejecutar(fn) abre UNA transacción y entrega `repos`:
 *  stocks{bloquear(ids)->Map, crear, guardar}, reservas{crear, bloquearPorPedido, actualizarEstado, bloquearVencidasActivas},
 *  movimientos{registrar}, idempotencia{obtener, guardar, purgar}, outbox{encolar}.
 */
export const PUERTOS_SALIDA = {
  UnidadDeTrabajo: ['ejecutar'],
  RepositorioDisponibilidad: ['consultarPorLote'],
  RepositorioHistorial: ['consultar'],
  RepositorioAlertas: ['registrar', 'resolver', 'listar'],
  CacheDisponibilidad: ['invalidar'],
};
export const PUERTO_REPOS = {
  stocks: ['bloquear', 'crear', 'guardar'],
  reservas: ['crear', 'bloquearPorPedido', 'actualizarEstado', 'bloquearVencidasActivas'],
  movimientos: ['registrar'],
  idempotencia: ['obtener', 'guardar', 'purgar'],
  outbox: ['encolar'],
};
export function verificarPuerto(catalogo, nombre, impl) {
  const faltan = (catalogo[nombre] ?? []).filter((m) => typeof impl[m] !== 'function');
  if (faltan.length) throw new Error(`${impl.constructor.name} no implementa el puerto ${nombre}: faltan ${faltan.join(', ')}`);
  return impl;
}
