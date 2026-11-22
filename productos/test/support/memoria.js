import { Categoria } from '../../src/domain/categoria.js';
import { Producto } from '../../src/domain/producto.js';

export const admin = { id: 'u-admin', tipo: 'user', roles: ['ADMINISTRADOR'], permisos: ['products:write', 'products:read'] };
export const vendedor = { id: 'u-vend', tipo: 'user', roles: ['VENDEDOR'], permisos: ['products:read'] };

export class CategoriasMem {
  m = new Map();
  async crear(c) { this.m.set(c.id, c.toJSON()); }
  async actualizar(c) { this.m.set(c.id, c.toJSON()); }
  async porId(id) { const o = this.m.get(id); return o ? Categoria.desde(o) : null; }
  async listar() { return [...this.m.values()].map((o) => Categoria.desde(o)); }
  async descendientes(id) {
    const out = []; const cola = [id];
    while (cola.length) { const p = cola.shift(); for (const c of this.m.values()) if (c.categoriaPadreId === p) { out.push(c.id); cola.push(c.id); } }
    return out;
  }
}

export class ProductosMem {
  m = new Map(); outbox = []; llamadasPorId = 0; fallosCodigo = 0;
  async crear(p, evento) {
    if (this.fallosCodigo > 0) { this.fallosCodigo--; const { DomainError } = await import('../../src/domain/errors.js'); throw new DomainError('CODIGO_DUPLICADO', 'dup'); }
    this.m.set(p.id, p.toJSON()); if (evento) this.outbox.push(evento);
  }
  async actualizar(p, evento) { this.m.set(p.id, p.toJSON()); if (evento) this.outbox.push(evento); }
  async porId(id) { this.llamadasPorId++; const o = this.m.get(id); return o ? Producto.desde(o) : null; }
  async buscar({ texto, categoriaId, estado, page, size }) {
    let r = [...this.m.values()].filter((p) => (!texto || (p.nombre + p.codigo).toLowerCase().includes(texto.toLowerCase())) && (!categoriaId || p.categoriaId === categoriaId) && (!estado || p.estado === estado));
    return { items: r.slice((page - 1) * size, page * size).map((o) => Producto.desde(o)), total: r.length };
  }
  async listarActivosPorCategorias(ids) { return [...this.m.values()].filter((p) => ids.includes(p.categoriaId) && p.estado === 'ACTIVO').map((o) => Producto.desde(o)); }
}

export class RedisFalso {
  m = new Map(); caido = false; sets = 0;
  async get(k) { if (this.caido) throw new Error('redis caído'); return this.m.get(k) ?? null; }
  async set(k, v) { if (this.caido) throw new Error('redis caído'); this.sets++; this.m.set(k, v); }
  async del(...ks) { if (this.caido) throw new Error('redis caído'); ks.forEach((k) => this.m.delete(k)); }
  async scan(_c, _m, patron) { const pre = patron.replace('*', ''); return ['0', [...this.m.keys()].filter((k) => k.startsWith(pre))]; }
}
