// Flujos de punta a punta (requiere servicios arriba y `npm run seed` en ambos).  node scripts/e2e.mjs
import { randomUUID } from 'node:crypto';
import { token } from './token.mjs';
const P = process.env.PRODUCTOS_URL ?? 'http://localhost:3001', I = process.env.INVENTARIO_URL ?? 'http://localhost:3002';
const SEED = 'a0000000-0000-4000-8000-000000000001';
let fallos = 0;
// JSONB de PostgreSQL no conserva el orden de las claves: se compara el contenido, no el orden.
const estable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fallos++; };
async function http(base, metodo, ruta, rol, cuerpo, extra = {}) {
  const r = await fetch(base + ruta, { method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${token(rol)}`, ...extra }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}
console.log('== Módulo Productos: registrar -> buscar con disponibilidad -> desactivar/activar ==');
let r = await http(P, 'POST', '/categories', 'ADMINISTRADOR', { nombre: `Cat-${Date.now()}` }); ok(r.status === 201, 'crear categoría (201)');
const cat = r.body.id;
r = await http(P, 'POST', '/products', 'ADMINISTRADOR', { nombre: 'Producto demo', categoriaId: cat, precioVenta: 10.5 }); ok(r.status === 201 && /^PRD-[0-9A-F]{8}$/.test(r.body.codigo), `registrar producto, código ${r.body?.codigo}`);
const pid = r.body.id;
r = await http(P, 'POST', '/products', 'VENDEDOR', { nombre: 'x', categoriaId: cat, precioVenta: 1 }); ok(r.status === 403, 'VENDEDOR no puede registrar (403 antes de la lógica)');
r = await http(P, 'GET', '/products?q=Smartphone', 'VENDEDOR'); ok(r.status === 200, 'buscar "Smartphone" (200, con disponibilidad de Inventario)');
console.log('   ', JSON.stringify(r.body).slice(0, 220));
r = await http(P, 'POST', `/products/${pid}/deactivate`, 'ADMINISTRADOR'); ok(r.status === 200, 'desactivar producto');
r = await http(P, 'POST', `/products/${pid}/activate`, 'ADMINISTRADOR'); ok(r.status === 200, 'activar producto');

console.log('== Módulo Inventario: disponibilidad -> entrada -> reserva idempotente -> liquidación -> historial ==');
const disp = async () => (await http(I, 'GET', `/inventory/availability?productIds=${SEED}`, 'VENDEDOR')).body.items[0];
const d0 = await disp(); ok(d0.availableStock >= 0, `disponibilidad inicial ${d0.availableStock}`);
r = await http(I, 'POST', '/inventory/movements', 'ALMACENERO', { productId: SEED, type: 'ENTRADA', quantity: 10, reason: 'e2e' }); ok(r.status === 201, 'ENTRADA +10 (Strategy)');
r = await http(I, 'POST', '/inventory/movements', 'ALMACENERO', { productId: SEED, type: 'SALIDA', quantity: 100000, reason: 'e2e' }); ok(r.status >= 400 && r.status < 500, 'SALIDA que dejaría stock negativo rechazada');
const pedido = randomUUID(), key = randomUUID(), dto = { orderId: pedido, items: [{ productId: SEED, quantity: 3 }] };
const h = { 'Idempotency-Key': key };
r = await http(I, 'POST', '/inventory/reservations', 'SERVICE_PEDIDOS', dto, h); ok(r.status === 201, 'reservar 3 (201)');
const r2 = await http(I, 'POST', '/inventory/reservations', 'SERVICE_PEDIDOS', dto, h); ok(r2.status === 201 && estable(r2.body) === estable(r.body), 'reintento con misma Idempotency-Key devuelve el mismo resultado');
const d1 = await disp(); ok(d1.reservedStock === d0.reservedStock + 3, 'stock reservado +3');
r = await http(I, 'POST', `/inventory/reservations/${pedido}/liquidate`, 'SERVICE_PEDIDOS', null, { 'Idempotency-Key': randomUUID() }); ok(r.status === 200, 'liquidar reserva (VENTA)');
r = await http(I, 'GET', `/inventory/movements?productId=${SEED}`, 'ADMINISTRADOR'); ok(r.status === 200, 'historial de movimientos');
console.log(`\n${fallos ? 'FALLÓ' : 'TODO OK'} (${fallos} fallos)`); process.exit(fallos ? 1 : 0);