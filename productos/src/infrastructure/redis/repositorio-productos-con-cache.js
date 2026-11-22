import { createHash } from 'node:crypto';
import { Producto } from '../../domain/producto.js';
import { logger } from '../../shared/logger.js';

const hash = (o) => createHash('sha1').update(JSON.stringify(o)).digest('hex');

/**
 * PROXY de caché (GoF, ADR-011/ADR-028) con la MISMA interfaz que RepositorioProductos.
 * cache-aside con TTL; si Redis falla se consulta PostgreSQL. Invalida DESPUÉS del commit.
 * Claves: product:{id}, product:list:{filtersHash}.
 */
export class RepositorioProductosConCache {
  constructor({ real, redis, ttlSeg = 600, log = logger }) { Object.assign(this, { real, redis, ttlSeg, log }); }

  async #leer(clave, cargar, hidratar) {
    try {
      const c = await this.redis.get(clave);
      if (c !== null && c !== undefined) return hidratar(JSON.parse(c));
    } catch (error) { this.log.error({ error, clave }, 'Redis no disponible; se usa PostgreSQL'); }
    const valor = await cargar();
    if (valor !== null) {
      try { await this.redis.set(clave, JSON.stringify(valor), 'EX', this.ttlSeg); }
      catch (error) { this.log.error({ error, clave }, 'No se pudo actualizar la caché'); }
    }
    return valor;
  }

  porId(id) { return this.#leer(`product:${id}`, () => this.real.porId(id), (o) => Producto.desde(o)); }

  buscar(filtros) {
    return this.#leer(`product:list:${hash(filtros)}`, () => this.real.buscar(filtros),
      (o) => ({ ...o, items: o.items.map((i) => Producto.desde(i)) }));
  }

  async crear(p, evento) { await this.real.crear(p, evento); await this.#invalidar(p.id); }
  async actualizar(p, evento) { await this.real.actualizar(p, evento); await this.#invalidar(p.id); }
  listarActivosPorCategorias(ids, limite) { return this.real.listarActivosPorCategorias(ids, limite); } // lectura de control: sin caché

  async #invalidar(id) {
    try {
      await this.redis.del(`product:${id}`);
      let cursor = '0';
      do { // los listados afectados no se conocen: se invalidan todos (TTL corto + pocas escrituras)
        const [sig, claves] = await this.redis.scan(cursor, 'MATCH', 'product:list:*', 'COUNT', 200);
        if (claves.length) await this.redis.del(...claves);
        cursor = sig;
      } while (cursor !== '0');
    } catch (error) { this.log.error({ error, id }, 'No se pudo invalidar la caché (el TTL limita la obsolescencia)'); }
  }
}
