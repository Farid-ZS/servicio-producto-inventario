import { Stock } from '../../src/domain/stock.js';
import { Reserva } from '../../src/domain/reserva.js';
import { PUERTO_REPOS, verificarPuerto } from '../../src/application/puertos.js';

export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const pedidos = { id: 'pedidos-service', tipo: 'service', roles: ['SERVICE_PEDIDOS'], permisos: ['inventory:availability:read', 'inventory:reservations'] };
export const productos = { id: 'productos-service', tipo: 'service', roles: ['SERVICE_PRODUCTOS'], permisos: ['inventory:availability:read'] };
export const almacenero = { id: uuid(901), tipo: 'user', roles: ['ALMACENERO'], permisos: ['inventory:availability:read', 'inventory:write'] };
export const admin = { id: uuid(902), tipo: 'user', roles: ['ADMINISTRADOR'], permisos: ['inventory:availability:read', 'inventory:history', 'inventory:admin'] };

/** Unidad de trabajo en memoria con commit/rollback por instantánea (misma semántica que UnidadDeTrabajoPg). */
export class UowMem {
  stocks = new Map(); reservas = new Map(); movimientos = []; idem = new Map(); outbox = []; commits = 0;
  #snap() { return structuredClone({ s: [...this.stocks], r: [...this.reservas], m: this.movimientos, i: [...this.idem], o: this.outbox }); }
  #restore(x) {
    this.stocks = new Map(x.s); this.reservas = new Map(x.r); this.movimientos = x.m; this.idem = new Map(x.i); this.outbox = x.o;
  }
  sembrar(n, { fisico = 0, reservado = 0, minimo = null, activo = true, version = 1 } = {}) {
    this.stocks.set(uuid(n), { productoId: uuid(n), stockFisico: fisico, stockReservado: reservado, stockMinimo: minimo, version, productoActivo: activo });
    return uuid(n);
  }
  stock(id) { return this.stocks.get(id); }

  async ejecutar(fn) {
    const antes = this.#snap();
    const self = this;
    const repos = {
      stocks: {
        async bloquear(ids) { return new Map(ids.filter((i) => self.stocks.has(i)).sort().map((i) => [i, new Stock(structuredClone(self.stocks.get(i)))])); },
        async crear(s) { if (!self.stocks.has(s.productoId)) self.stocks.set(s.productoId, structuredClone({ ...s })); },
        async guardar(s) {
          if (s.stockFisico < 0 || s.stockReservado < 0 || s.stockReservado > s.stockFisico) throw new Error('CHECK de BD violado');
          self.stocks.set(s.productoId, structuredClone({ ...s }));
        },
      },
      reservas: {
        async crear(l) { l.forEach((r) => self.reservas.set(r.id, structuredClone({ ...r }))); },
        async bloquearPorPedido(p) { return [...self.reservas.values()].filter((r) => r.pedidoId === p).sort((a, b) => (a.productoId < b.productoId ? -1 : 1)).map((r) => new Reserva(r)); },
        async actualizarEstado(ids, e) { ids.forEach((id) => { self.reservas.get(id).estado = e; }); },
        async bloquearVencidasActivas(ahora, lim) { return [...self.reservas.values()].filter((r) => r.estado === 'ACTIVA' && new Date(r.venceEn) <= ahora).slice(0, lim).map((r) => new Reserva(r)); },
      },
      movimientos: { async registrar(m) { self.movimientos.push(structuredClone(m)); } },
      idempotencia: {
        async obtener(c, desde) { const r = self.idem.get(c); return r && new Date(r.creadaEn) > desde ? structuredClone(r) : null; },
        async guardar(r) { self.idem.set(r.clave, structuredClone(r)); },
        async purgar() {},
      },
      outbox: { async encolar(e) { self.outbox.push(structuredClone(e)); } },
    };
    Object.entries(PUERTO_REPOS).forEach(([n, ms]) => verificarPuerto(PUERTO_REPOS, n, repos[n]));
    try { const r = await fn(repos); this.commits++; return r; }
    catch (e) { this.#restore(antes); throw e; }
  }
}

export class PublicadorEspia { cambios = []; async publicar(c) { this.cambios.push(...c); } }
