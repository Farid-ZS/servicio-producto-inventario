import test from 'node:test';
import assert from 'node:assert/strict';
import { UowMem, PublicadorEspia, uuid, pedidos, productos, almacenero, admin } from './support/memoria.js';
import { RegistroEstrategias, EstrategiaEntrada } from '../src/domain/estrategias/estrategias.js';
import { TipoMovimiento } from '../src/domain/tipos.js';
import { DomainError } from '../src/domain/errors.js';
import { ReservarStock } from '../src/application/casos-de-uso/reservar-stock.js';
import { LiberarReserva } from '../src/application/casos-de-uso/liberar-reserva.js';
import { LiquidarReserva } from '../src/application/casos-de-uso/liquidar-reserva.js';
import { RegistrarMovimiento } from '../src/application/casos-de-uso/registrar-movimiento.js';
import { ExpirarReservasVencidas } from '../src/application/casos-de-uso/expirar-reservas-vencidas.js';
import { SincronizarCicloVidaProducto, EventoNoListoError } from '../src/application/casos-de-uso/sincronizar-ciclo-vida-producto.js';
import { ConsultarDisponibilidad } from '../src/application/casos-de-uso/consultar-disponibilidad.js';
import { PublicadorCambioStock, ObservadorAlertaStockBajo, ObservadorInvalidarCache } from '../src/application/observadores/publicador-cambio-stock.js';
import { PUERTOS_ENTRADA, verificarPuerto } from '../src/application/puertos.js';

const rechaza = (p, code, extra) => assert.rejects(p, (e) => e instanceof DomainError && e.code === code && (!extra || extra(e)));
const ORDEN = uuid(500); const ORDEN2 = uuid(501);

function entorno(ahora = new Date('2026-01-01T10:00:00Z')) {
  const uow = new UowMem(); const pub = new PublicadorEspia(); const estrategias = new RegistroEstrategias();
  const reloj = () => ahora; const deps = { uow, publicador: pub, estrategias, reloj };
  const e = { uow, pub, estrategias, reloj, ahora,
    reservar: new ReservarStock(deps), liberar: new LiberarReserva(deps), liquidar: new LiquidarReserva(deps),
    mov: new RegistrarMovimiento(deps), expirar: new ExpirarReservasVencidas(deps), sync: new SincronizarCicloVidaProducto({ uow }) };
  e.reservarOk = (orderId, items, k = `k-${orderId}`) => e.reservar.ejecutar({ orderId, items, expiresAt: '2026-01-01T12:00:00Z' }, { idempotencyKey: k }, pedidos);
  return e;
}
const it = (n, q) => ({ productId: uuid(n), quantity: q });

test('los casos de uso cumplen los puertos de entrada', () => {
  const e = entorno();
  verificarPuerto(PUERTOS_ENTRADA, 'ReservarStock', e.reservar); verificarPuerto(PUERTOS_ENTRADA, 'LiquidarReserva', e.liquidar);
  verificarPuerto(PUERTOS_ENTRADA, 'ExpirarReservasVencidas', e.expirar);
});

test('RF-INV-05: reserva atómica descuenta del disponible (físico - reservado)', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10 }); e.uow.sembrar(2, { fisico: 5 });
  const r = await e.reservarOk(ORDEN, [it(1, 4), it(2, 5)]);
  assert.equal(r.status, 'ACTIVA'); assert.equal(r.items.length, 2);
  assert.equal(e.uow.stock(uuid(1)).stockReservado, 4); assert.equal(e.uow.stock(uuid(2)).stockReservado, 5);
  assert.equal(e.pub.cambios.length, 2);
});

test('RF-INV-06: todo-o-nada — si una línea no alcanza, no se reserva NADA y se informan las faltantes', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10 }); e.uow.sembrar(2, { fisico: 1 });
  await rechaza(e.reservarOk(ORDEN, [it(1, 3), it(2, 2)]), 'INSUFFICIENT_STOCK', (x) => x.details.items[0].productId === uuid(2) && x.details.items[0].available === 1);
  assert.equal(e.uow.stock(uuid(1)).stockReservado, 0); assert.equal(e.uow.reservas.size, 0);
});

test('no sobreventa: dos pedidos compiten por las mismas unidades', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 5 });
  await e.reservarOk(ORDEN, [it(1, 4)]);
  await rechaza(e.reservarOk(ORDEN2, [it(1, 2)]), 'INSUFFICIENT_STOCK');
  assert.equal(e.uow.stock(uuid(1)).stockReservado, 4);
});

test('ADR-025: producto inactivo o inexistente no admite nuevas reservas', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 5, activo: false });
  await rechaza(e.reservarOk(ORDEN, [it(1, 1)]), 'PRODUCT_INACTIVE');
  await rechaza(e.reservarOk(ORDEN, [it(9, 1)]), 'PRODUCT_NOT_FOUND');
});

test('ADR-021: Productos (solo lectura) no puede reservar; ADR-023: se exige Idempotency-Key', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 5 });
  await rechaza(e.reservar.ejecutar({ orderId: ORDEN, items: [it(1, 1)] }, { idempotencyKey: 'abcdefgh' }, productos), 'UNAUTHORIZED');
  await rechaza(e.reservar.ejecutar({ orderId: ORDEN, items: [it(1, 1)] }, {}, pedidos), 'INVALID_REQUEST');
  assert.equal(e.uow.reservas.size, 0);
});

test('ADR-023: misma clave+payload devuelve el resultado original sin reservar dos veces; otro payload => 409', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10 });
  const a = await e.reservarOk(ORDEN, [it(1, 3)], 'clave-0001');
  const b = await e.reservarOk(ORDEN, [it(1, 3)], 'clave-0001');
  assert.deepEqual(a, b); assert.equal(e.uow.stock(uuid(1)).stockReservado, 3); assert.equal(e.pub.cambios.length, 1);
  await rechaza(e.reservarOk(ORDEN, [it(1, 4)], 'clave-0001'), 'IDEMPOTENCY_KEY_REUSE');
});

test('RF-INV-07: release devuelve unidades y es idempotente; no se libera un pedido ya pagado', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10 });
  await e.reservarOk(ORDEN, [it(1, 4)]);
  const r1 = await e.liberar.ejecutar({ orderId: ORDEN }, { idempotencyKey: 'rel-00001' }, pedidos);
  assert.equal(r1.status, 'LIBERADA'); assert.equal(e.uow.stock(uuid(1)).stockReservado, 0);
  const r2 = await e.liberar.ejecutar({ orderId: ORDEN }, { idempotencyKey: 'rel-00002' }, pedidos); // otra clave: igual no duplica
  assert.equal(r2.status, 'LIBERADA'); assert.equal(e.uow.stock(uuid(1)).stockReservado, 0);

  await e.reservarOk(ORDEN2, [it(1, 2)]);
  await e.liquidar.ejecutar({ orderId: ORDEN2 }, { idempotencyKey: 'liq-00001' }, pedidos);
  await rechaza(e.liberar.ejecutar({ orderId: ORDEN2 }, { idempotencyKey: 'rel-00003' }, pedidos), 'INVALID_REQUEST', (x) => x.statusCode === 409);
  await rechaza(e.liberar.ejecutar({ orderId: uuid(777) }, { idempotencyKey: 'rel-00004' }, pedidos), 'RESERVATION_NOT_FOUND');
});

test('RF-INV-11 / ADR-026: liquidate descuenta físico, consume reserva, registra VENTA y no repite el descuento', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10 });
  await e.reservarOk(ORDEN, [it(1, 4)]);
  const r = await e.liquidar.ejecutar({ orderId: ORDEN }, { idempotencyKey: 'liq-00001' }, pedidos);
  assert.equal(r.status, 'LIQUIDADA');
  assert.deepEqual([e.uow.stock(uuid(1)).stockFisico, e.uow.stock(uuid(1)).stockReservado], [6, 0]);
  assert.equal(e.uow.movimientos.length, 1);
  assert.equal(e.uow.movimientos[0].tipo, 'VENTA'); assert.equal(e.uow.movimientos[0].pedidoId, ORDEN);
  await e.liquidar.ejecutar({ orderId: ORDEN }, { idempotencyKey: 'liq-00001' }, pedidos); // reintento mismo key
  await e.liquidar.ejecutar({ orderId: ORDEN }, { idempotencyKey: 'liq-00002' }, pedidos); // reintento con otra key
  assert.equal(e.uow.stock(uuid(1)).stockFisico, 6); assert.equal(e.uow.movimientos.length, 1);
});

test('liquidate: reserva vencida => RESERVATION_EXPIRED; liberada/inexistente => RESERVATION_NOT_FOUND', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10 });
  await e.reservar.ejecutar({ orderId: ORDEN, items: [it(1, 2)], expiresAt: '2026-01-01T10:30:00Z' }, { idempotencyKey: 'k-reserva' }, pedidos);
  const tarde = new LiquidarReserva({ uow: e.uow, publicador: e.pub, estrategias: e.estrategias, reloj: () => new Date('2026-01-01T11:00:00Z') });
  await rechaza(tarde.ejecutar({ orderId: ORDEN }, { idempotencyKey: 'liq-tarde1' }, pedidos), 'RESERVATION_EXPIRED');
  assert.equal(e.uow.stock(uuid(1)).stockFisico, 10);
  await rechaza(e.liquidar.ejecutar({ orderId: uuid(999) }, { idempotencyKey: 'liq-nada01' }, pedidos), 'RESERVATION_NOT_FOUND');
});

test('ADR-015: el worker libera reservas vencidas, emite ReservaExpirada vía Outbox y es idempotente', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10 });
  await e.reservar.ejecutar({ orderId: ORDEN, items: [it(1, 3)], expiresAt: '2026-01-01T10:30:00Z' }, { idempotencyKey: 'k-reserva' }, pedidos);
  await e.reservarOk(ORDEN2, [it(1, 2)]); // vence a las 12:00: no debe tocarse
  const worker = new ExpirarReservasVencidas({ uow: e.uow, publicador: e.pub, reloj: () => new Date('2026-01-01T11:00:00Z') });
  assert.equal(await worker.ejecutar(), 1);
  assert.equal(e.uow.stock(uuid(1)).stockReservado, 2);
  assert.equal(e.uow.outbox.length, 1); assert.equal(e.uow.outbox[0].eventType, 'ReservaExpirada'); assert.equal(e.uow.outbox[0].aggregateId, ORDEN);
  assert.equal(await worker.ejecutar(), 0); assert.equal(e.uow.outbox.length, 1); // no vuelve a liberar
  assert.equal(e.uow.stock(uuid(1)).stockReservado, 2);
});

test('Strategy (ADR-013): entrada/salida/ajuste con motivo, usuario y fecha; stock nunca negativo', async () => {
  const e = entorno(); const id = e.uow.sembrar(1, { fisico: 5 });
  const m = await e.mov.ejecutar({ productId: id, type: 'ENTRADA', quantity: 10, reason: 'Compra' }, almacenero);
  assert.equal(m.physicalStock, 15); assert.equal(m.userId, almacenero.id); assert.ok(m.date);
  await e.mov.ejecutar({ productId: id, type: 'SALIDA', quantity: 3, reason: 'Merma' }, almacenero);
  await e.mov.ejecutar({ productId: id, type: 'AJUSTE', quantity: -2, reason: 'Conteo' }, almacenero);
  assert.equal(e.uow.stock(id).stockFisico, 10); assert.equal(e.uow.movimientos.length, 3);
  await rechaza(e.mov.ejecutar({ productId: id, type: 'SALIDA', quantity: 11, reason: 'x' }, almacenero), 'INSUFFICIENT_STOCK');
  await rechaza(e.mov.ejecutar({ productId: id, type: 'AJUSTE', quantity: -11, reason: 'x' }, almacenero), 'INSUFFICIENT_STOCK');
  await rechaza(e.mov.ejecutar({ productId: id, type: 'ENTRADA', quantity: 1, reason: ' ' }, almacenero), 'INVALID_REQUEST');
  await rechaza(e.mov.ejecutar({ productId: id, type: 'ENTRADA', quantity: 1, reason: 'x' }, admin), 'UNAUTHORIZED');
  assert.equal(e.uow.movimientos.length, 3); // los rechazos no dejan rastro ni cambian stock
});

test('ADR-027: salidas/ajustes no pueden invadir stock reservado; VENTA no es manual', async () => {
  const e = entorno(); const id = e.uow.sembrar(1, { fisico: 10 });
  await e.reservarOk(ORDEN, [it(1, 8)]);
  await rechaza(e.mov.ejecutar({ productId: id, type: 'SALIDA', quantity: 3, reason: 'x' }, almacenero), 'RESERVED_STOCK_CONFLICT', (x) => x.details.usableStock === 2);
  await rechaza(e.mov.ejecutar({ productId: id, type: 'AJUSTE', quantity: -3, reason: 'x' }, almacenero), 'RESERVED_STOCK_CONFLICT');
  await e.mov.ejecutar({ productId: id, type: 'SALIDA', quantity: 2, reason: 'ok' }, almacenero);
  await rechaza(e.mov.ejecutar({ productId: id, type: 'VENTA', quantity: 1, reason: 'x' }, almacenero), 'INVALID_REQUEST');
});

test('Mantenibilidad: un tipo nuevo (DEVOLUCION) se agrega con una estrategia, sin tocar reservas', async () => {
  class EstrategiaDevolucion extends EstrategiaEntrada { tipo = 'DEVOLUCION'; }
  const registro = new RegistroEstrategias([new EstrategiaDevolucion()]);
  assert.equal(registro.manual('DEVOLUCION').calcular({}, 2).deltaFisico, 2);
  assert.deepEqual(Object.values(TipoMovimiento).filter((t) => !new RegistroEstrategias().m.has(t)), []); // todo tipo tiene estrategia
});

test('ADR-025: sincronización por eventos es idempotente y tolera desorden/duplicados', async () => {
  const e = entorno(); const id = uuid(1);
  const ev = (eventType, version) => ({ eventId: 'e', eventType, aggregateId: id, version, occurredAt: '', payload: {} });
  await assert.rejects(e.sync.ejecutar(ev('ProductoDesactivado', 2)), EventoNoListoError); // adelantado: sin ProductoCreado
  assert.equal(await e.sync.ejecutar(ev('ProductoCreado', 1)), 'CREADO');
  assert.deepEqual([e.uow.stock(id).stockFisico, e.uow.stock(id).stockReservado, e.uow.stock(id).productoActivo], [0, 0, true]);
  assert.equal(await e.sync.ejecutar(ev('ProductoCreado', 1)), 'IGNORADO_DUPLICADO');
  await assert.rejects(e.sync.ejecutar(ev('ProductoActivado', 3)), EventoNoListoError); // v3 antes que v2
  assert.equal(await e.sync.ejecutar(ev('ProductoDesactivado', 2)), 'APLICADO');
  assert.equal(e.uow.stock(id).productoActivo, false);
  assert.equal(await e.sync.ejecutar(ev('ProductoDesactivado', 2)), 'IGNORADO_ANTIGUO');
  assert.equal(await e.sync.ejecutar(ev('ProductoActivado', 3)), 'APLICADO');
  assert.equal(e.uow.stock(id).productoActivo, true);
});

test('desactivar un producto conserva sus reservas vigentes y permite liquidarlas (ADR-025)', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10, version: 1 });
  await e.reservarOk(ORDEN, [it(1, 2)]);
  await e.sync.ejecutar({ eventType: 'ProductoDesactivado', aggregateId: uuid(1), version: 2 });
  const r = await e.liquidar.ejecutar({ orderId: ORDEN }, { idempotencyKey: 'liq-00001' }, pedidos);
  assert.equal(r.status, 'LIQUIDADA');
});

test('Observer (ADR-014): alerta de stock bajo y invalidación de caché tras el cambio; un observador caído no rompe la operación', async () => {
  const alertas = new Map(); const invalidados = [];
  const log = { error() {} };
  const pubReal = new PublicadorCambioStock(log)
    .suscribir(new ObservadorAlertaStockBajo({ registrar: async (a) => alertas.set(a.productoId, a), resolver: async (id) => alertas.delete(id) }))
    .suscribir(new ObservadorInvalidarCache({ invalidar: async (ids) => { invalidados.push(...ids); } }))
    .suscribir({ alCambiarStock: async () => { throw new Error('observador roto'); } });
  const e = entorno(); e.uow.sembrar(1, { fisico: 10, minimo: 5 }); e.uow.sembrar(2, { fisico: 10 }); // 2: sin mínimo
  const mov = new RegistrarMovimiento({ uow: e.uow, publicador: pubReal, estrategias: e.estrategias, reloj: e.reloj });
  await mov.ejecutar({ productId: uuid(1), type: 'SALIDA', quantity: 6, reason: 'x' }, almacenero);
  assert.equal(alertas.get(uuid(1)).stockDisponible, 4);
  await mov.ejecutar({ productId: uuid(1), type: 'ENTRADA', quantity: 10, reason: 'x' }, almacenero);
  assert.equal(alertas.has(uuid(1)), false); // se resuelve al superar el mínimo
  await mov.ejecutar({ productId: uuid(2), type: 'SALIDA', quantity: 10, reason: 'x' }, almacenero);
  assert.equal(alertas.has(uuid(2)), false); // sin mínimo configurado: no se evalúa
  assert.deepEqual(invalidados, [uuid(1), uuid(1), uuid(2)]);
});

test('ADR-019: disponibilidad por lote (máx. 100); producto sin stock => 0; sin permiso => 403', async () => {
  const e = entorno(); e.uow.sembrar(1, { fisico: 10, reservado: 4 });
  const cu = new ConsultarDisponibilidad({ disponibilidad: { consultarPorLote: async (ids) => ({ source: 'db', items: ids.filter((i) => e.uow.stocks.has(i)).map((i) => { const s = e.uow.stock(i); return { productId: i, physicalStock: s.stockFisico, reservedStock: s.stockReservado, availableStock: s.stockFisico - s.stockReservado }; }) }) } });
  const r = await cu.ejecutar({ productIds: [uuid(1), uuid(2)] }, productos);
  assert.equal(r.items[0].availableStock, 6); assert.equal(r.items[1].availableStock, 0);
  await rechaza(cu.ejecutar({ productIds: Array.from({ length: 101 }, (_, i) => uuid(i + 1)) }, productos), 'INVALID_REQUEST');
  await rechaza(cu.ejecutar({ productIds: [uuid(1)] }, { id: 'x', permisos: [] }), 'UNAUTHORIZED');
});
