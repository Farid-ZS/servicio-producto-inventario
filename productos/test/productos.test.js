import test from 'node:test';
import assert from 'node:assert/strict';
import { admin, vendedor, CategoriasMem, ProductosMem, RedisFalso } from './support/memoria.js';
import { GestionarCategorias } from '../src/application/casos-de-uso/gestionar-categorias.js';
import { RegistrarProducto } from '../src/application/casos-de-uso/registrar-producto.js';
import { ModificarProducto } from '../src/application/casos-de-uso/modificar-producto.js';
import { CambiarEstadoProducto } from '../src/application/casos-de-uso/cambiar-estado-producto.js';
import { ConsultarCatalogo } from '../src/application/casos-de-uso/consultar-catalogo.js';
import { RepositorioProductosConCache } from '../src/infrastructure/redis/repositorio-productos-con-cache.js';
import { InventarioClient } from '../src/infrastructure/http/inventario-client.js';
import { DomainError } from '../src/domain/errors.js';
import { SERVICIOS_APLICACION, INTERFACES_INFRA, verificarInterfaz } from '../src/application/interfaces.js';

const silencio = { info() {}, warn() {}, error() {} };
function entorno() {
  const categorias = new CategoriasMem(); const productos = new ProductosMem();
  let n = 0;
  const gen = () => `PRD-${String(++n).padStart(8, '0')}`;
  return {
    categorias, productos,
    cat: new GestionarCategorias({ categorias, productos }),
    reg: new RegistrarProducto({ productos, categorias, generarCodigo: gen, maxReintentos: 3 }),
    mod: new ModificarProducto({ productos, categorias }),
    est: new CambiarEstadoProducto({ productos }),
  };
}
const rechaza = (p, code) => assert.rejects(p, (e) => e instanceof DomainError && e.code === code);

test('los adaptadores en memoria cumplen los interfaces de infraestructura', () => {
  const e = entorno();
  verificarInterfaz(INTERFACES_INFRA, 'RepositorioProductos', e.productos);
  verificarInterfaz(INTERFACES_INFRA, 'RepositorioCategorias', e.categorias);
  verificarInterfaz(SERVICIOS_APLICACION, 'RegistrarProducto', e.reg);
  verificarInterfaz(SERVICIOS_APLICACION, 'GestionarCategorias', e.cat);
});

test('RF-PRO-01: registra ACTIVO con código generado y publica ProductoCreado en la Outbox', async () => {
  const e = entorno();
  const c = await e.cat.crear({ nombre: 'Bebidas' }, admin);
  const p = await e.reg.ejecutar({ nombre: 'Gaseosa', categoriaId: c.id, precioVenta: 3.5 }, admin);
  assert.equal(p.estado, 'ACTIVO'); assert.match(p.codigo, /^PRD-/);
  assert.equal(e.productos.outbox[0].eventType, 'ProductoCreado');
  assert.equal(e.productos.outbox[0].aggregateId, p.id);
  assert.equal(e.productos.outbox[0].version, 1);
});

test('ADR-016: ante colisión de código reintenta sin exponer el error; si se agotan, no crea producto', async () => {
  const e = entorno(); const c = await e.cat.crear({ nombre: 'X' }, admin);
  e.productos.fallosCodigo = 2;
  const p = await e.reg.ejecutar({ nombre: 'A', categoriaId: c.id, precioVenta: 1 }, admin);
  assert.ok(p.codigo);
  e.productos.fallosCodigo = 10;
  await rechaza(e.reg.ejecutar({ nombre: 'B', categoriaId: c.id, precioVenta: 1 }, admin), 'SERVICE_UNAVAILABLE');
  assert.equal(e.productos.m.size, 1);
});

test('ADR-018: sin permiso se rechaza (403) antes de tocar el repositorio', async () => {
  const e = entorno(); const c = await e.cat.crear({ nombre: 'X' }, admin);
  await rechaza(e.reg.ejecutar({ nombre: 'A', categoriaId: c.id, precioVenta: 1 }, vendedor), 'UNAUTHORIZED');
  assert.equal(e.productos.m.size, 0);
});

test('validaciones: categoría inexistente, precio negativo, código inmutable', async () => {
  const e = entorno(); const c = await e.cat.crear({ nombre: 'X' }, admin);
  await rechaza(e.reg.ejecutar({ nombre: 'A', categoriaId: '00000000-0000-4000-8000-000000000000', precioVenta: 1 }, admin), 'CATEGORY_NOT_FOUND');
  await rechaza(e.reg.ejecutar({ nombre: 'A', categoriaId: c.id, precioVenta: -1 }, admin), 'INVALID_REQUEST');
  const p = await e.reg.ejecutar({ nombre: 'A', categoriaId: c.id, precioVenta: 1 }, admin);
  await rechaza(e.mod.ejecutar(p.id, { codigo: 'OTRO' }, admin), 'INVALID_REQUEST');
  const m = await e.mod.ejecutar(p.id, { precioVenta: 9.99 }, admin);
  assert.equal(m.precioVenta, 9.99);
});

test('CU-PRO-06: activar/desactivar emite eventos versionados y es idempotente', async () => {
  const e = entorno(); const c = await e.cat.crear({ nombre: 'X' }, admin);
  const p = await e.reg.ejecutar({ nombre: 'A', categoriaId: c.id, precioVenta: 1 }, admin);
  await e.est.desactivar(p.id, admin); await e.est.desactivar(p.id, admin); await e.est.activar(p.id, admin);
  assert.deepEqual(e.productos.outbox.map((x) => [x.eventType, x.version]),
    [['ProductoCreado', 1], ['ProductoDesactivado', 2], ['ProductoActivado', 3]]);
});

test('RF-PRO-07: sin ciclos y no se desactiva con productos activos en descendientes', async () => {
  const e = entorno();
  const a = await e.cat.crear({ nombre: 'A' }, admin);
  const b = await e.cat.crear({ nombre: 'B', categoriaPadreId: a.id }, admin);
  const c = await e.cat.crear({ nombre: 'C', categoriaPadreId: b.id }, admin);
  await rechaza(e.cat.modificar(a.id, { categoriaPadreId: c.id }, admin), 'CATEGORY_CYCLE');
  await rechaza(e.cat.modificar(a.id, { categoriaPadreId: a.id }, admin), 'CATEGORY_CYCLE');
  const p = await e.reg.ejecutar({ nombre: 'P', categoriaId: c.id, precioVenta: 1 }, admin);
  await assert.rejects(e.cat.desactivar(a.id, admin), (x) => x.code === 'CATEGORY_HAS_ACTIVE_PRODUCTS' && x.details.products[0].id === p.id);
  await e.est.desactivar(p.id, admin);
  assert.equal((await e.cat.desactivar(a.id, admin)).estado, 'INACTIVA');
});

test('CU-PRO-02/03/04: compone disponibilidad por lote; inactivos no consultan stock', async () => {
  const e = entorno(); const c = await e.cat.crear({ nombre: 'X' }, admin);
  const p1 = await e.reg.ejecutar({ nombre: 'Uno', categoriaId: c.id, precioVenta: 1 }, admin);
  const p2 = await e.reg.ejecutar({ nombre: 'Dos', categoriaId: c.id, precioVenta: 1 }, admin);
  await e.est.desactivar(p2.id, admin);
  const pedidos = [];
  const cat = new ConsultarCatalogo({ productos: e.productos, disponibilidad: { consultarPorLote: async (ids) => { pedidos.push(ids); return new Map([[p1.id, 7]]); } } });
  const r = await cat.buscar({ texto: 'o' }, vendedor);
  assert.equal(pedidos.length, 1); assert.deepEqual(pedidos[0], [p1.id]);
  assert.equal(r.items.find((i) => i.id === p1.id).disponibilidad.stockDisponible, 7);
  assert.equal(r.items.find((i) => i.id === p2.id).disponibilidad.motivo, 'PRODUCTO_INACTIVO');
});

test('ADR-003: si Inventario falla NO se muestra catálogo disponible: se propaga el error', async () => {
  const e = entorno(); const c = await e.cat.crear({ nombre: 'X' }, admin);
  await e.reg.ejecutar({ nombre: 'Uno', categoriaId: c.id, precioVenta: 1 }, admin);
  const cat = new ConsultarCatalogo({ productos: e.productos, disponibilidad: { consultarPorLote: async () => { throw new DomainError('REQUEST_TIMEOUT', 't'); } } });
  await rechaza(cat.buscar({}, vendedor), 'REQUEST_TIMEOUT');
  await rechaza(cat.buscar({ size: 500 }, vendedor), 'INVALID_REQUEST');
});

test('Proxy ADR-011/028: miss->BD, hit->caché, invalida tras escribir, tolera Redis caído', async () => {
  const e = entorno(); const c = await e.cat.crear({ nombre: 'X' }, admin);
  const p = await e.reg.ejecutar({ nombre: 'A', categoriaId: c.id, precioVenta: 1 }, admin);
  const redis = new RedisFalso();
  const proxy = new RepositorioProductosConCache({ real: e.productos, redis, ttlSeg: 600, log: silencio });
  await proxy.porId(p.id); await proxy.porId(p.id);
  assert.equal(e.productos.llamadasPorId, 1);
  const modificado = await proxy.porId(p.id); modificado.modificar({ nombre: 'Nuevo' });
  await proxy.actualizar(modificado);
  assert.equal((await proxy.porId(p.id)).nombre, 'Nuevo');
  redis.caido = true;
  assert.equal((await proxy.porId(p.id)).nombre, 'Nuevo'); // fallback a PostgreSQL
});

test('InventarioClient: lotes de 100, timeout->REQUEST_TIMEOUT, 5xx->SERVICE_UNAVAILABLE, sin reintentos', async () => {
  const firmante = { firmar: () => 't' };
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  const urls = [];
  const ok = new InventarioClient({ baseUrl: 'http://x', firmante, fetchImpl: async (u) => {
    urls.push(u); const q = new URL(u).searchParams.get('productIds').split(',');
    return { ok: true, json: async () => ({ items: q.map((id) => ({ productId: id, availableStock: 2 })) }) };
  } });
  const mapa = await ok.consultarPorLote(ids);
  assert.equal(urls.length, 3); assert.equal(mapa.size, 250);

  let calls = 0;
  const lento = new InventarioClient({ baseUrl: 'http://x', firmante, timeoutMs: 20, fetchImpl: (_u, { signal }) => { calls++; return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })))); } });
  await rechaza(lento.consultarPorLote(['a']), 'REQUEST_TIMEOUT'); assert.equal(calls, 1);
  const caido = new InventarioClient({ baseUrl: 'http://x', firmante, fetchImpl: async () => ({ ok: false, status: 502 }) });
  await rechaza(caido.consultarPorLote(['a']), 'SERVICE_UNAVAILABLE');
});
